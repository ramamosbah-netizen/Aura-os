import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { decryptField, encryptField, isEncryptedField } from './field-crypto';

describe('field-crypto (gap #14 — PII at rest)', () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = 'unit-test-secret';
  });
  afterEach(() => {
    delete process.env.PII_ENCRYPTION_KEY;
  });

  it('round-trips a value through the enc:v1 wire format', () => {
    const iban = 'AE070331234567890123456';
    const stored = encryptField(iban)!;
    expect(stored).not.toContain(iban);
    expect(isEncryptedField(stored)).toBe(true);
    expect(decryptField(stored)).toBe(iban);
  });

  it('produces distinct ciphertexts per call (random IV)', () => {
    expect(encryptField('same')).not.toBe(encryptField('same'));
  });

  it('does not double-encrypt already-encrypted values', () => {
    const once = encryptField('secret')!;
    expect(encryptField(once)).toBe(once);
  });

  it('passes legacy plaintext through decryptField unchanged', () => {
    expect(decryptField('AE07plaintext')).toBe('AE07plaintext');
  });

  it('fails closed on tampered ciphertext', () => {
    const stored = encryptField('secret')!;
    const tampered = stored.slice(0, -4) + 'AAA=';
    expect(decryptField(tampered)).toBeNull();
  });

  it('is the identity function when PII_ENCRYPTION_KEY is unset (staged seam)', () => {
    delete process.env.PII_ENCRYPTION_KEY;
    expect(encryptField('plain')).toBe('plain');
    expect(decryptField('plain')).toBe('plain');
  });

  it('fails closed when data is encrypted but the key is missing', () => {
    const stored = encryptField('secret')!;
    delete process.env.PII_ENCRYPTION_KEY;
    expect(decryptField(stored)).toBeNull();
  });

  it('decrypts under PII_ENCRYPTION_KEY_PREVIOUS during a staged rotation', () => {
    const stored = encryptField('AE070331234567890123456')!; // written under the old key
    process.env.PII_ENCRYPTION_KEY = 'rotated-new-secret';
    expect(decryptField(stored)).toBeNull(); // new key alone can't read old rows
    process.env.PII_ENCRYPTION_KEY_PREVIOUS = 'unit-test-secret';
    expect(decryptField(stored)).toBe('AE070331234567890123456');
    // new writes use the new key and stay readable without the previous key
    const rewritten = encryptField('AE070331234567890123456')!;
    delete process.env.PII_ENCRYPTION_KEY_PREVIOUS;
    expect(decryptField(rewritten)).toBe('AE070331234567890123456');
  });

  it('handles null/empty passthrough', () => {
    expect(encryptField(null)).toBeNull();
    expect(decryptField(null)).toBeNull();
    expect(encryptField('')).toBe('');
  });
});
