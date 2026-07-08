import { describe, it, expect } from 'vitest';
import {
  encodeBase32,
  decodeBase32,
  totpCodeAt,
  verifyTotp,
  generateTotpSecret,
  totpAuthUri,
} from './totp';

// RFC 6238 Appendix B reference seed: ASCII "12345678901234567890".
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32 codec', () => {
  it('encodes the RFC seed and round-trips', () => {
    expect(encodeBase32(Buffer.from('12345678901234567890'))).toBe(RFC_SECRET);
    expect(decodeBase32(RFC_SECRET).toString()).toBe('12345678901234567890');
  });
});

describe('TOTP (RFC 6238 test vectors, SHA1, 8 digits)', () => {
  const at = (sec: number) => totpCodeAt(RFC_SECRET, sec * 1000, { digits: 8 });
  it('matches the published codes at the reference times', () => {
    expect(at(59)).toBe('94287082');
    expect(at(1111111109)).toBe('07081804');
    expect(at(1111111111)).toBe('14050471');
    expect(at(1234567890)).toBe('89005924');
    expect(at(2000000000)).toBe('69279037');
  });
});

describe('verifyTotp', () => {
  const atMs = 1234567890 * 1000;

  it('accepts the current code and rejects a wrong one', () => {
    const code = totpCodeAt(RFC_SECRET, atMs);
    expect(verifyTotp(RFC_SECRET, code, { atMs })).toBe(true);
    expect(verifyTotp(RFC_SECRET, '000000', { atMs })).toBe(false);
  });

  it('tolerates ±1 step of clock skew within the window, not beyond', () => {
    const prev = totpCodeAt(RFC_SECRET, atMs - 30_000);
    const next = totpCodeAt(RFC_SECRET, atMs + 30_000);
    const far = totpCodeAt(RFC_SECRET, atMs + 120_000);
    expect(verifyTotp(RFC_SECRET, prev, { atMs, window: 1 })).toBe(true);
    expect(verifyTotp(RFC_SECRET, next, { atMs, window: 1 })).toBe(true);
    expect(verifyTotp(RFC_SECRET, far, { atMs, window: 1 })).toBe(false);
  });

  it('rejects a code of the wrong length', () => {
    expect(verifyTotp(RFC_SECRET, '1234', { atMs })).toBe(false);
  });
});

describe('enrollment helpers', () => {
  it('generates a usable secret and verifies its own code', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThanOrEqual(32);
    const now = Date.now();
    expect(verifyTotp(secret, totpCodeAt(secret, now), { atMs: now })).toBe(true);
  });

  it('builds an otpauth URI carrying the secret and issuer', () => {
    const uri = totpAuthUri('JBSWY3DPEHPK3PXP', { label: 'jane@acme.com', issuer: 'AURA' });
    expect(uri).toMatch(/^otpauth:\/\/totp\/AURA:jane%40acme\.com\?/);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=AURA');
  });
});
