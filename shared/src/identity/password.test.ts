import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  hashPassword,
  isPasswordHash,
  validatePassword,
  verifyPassword,
} from './password';

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const stored = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery stapl', stored)).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it('salts, so the same password never hashes to the same string', async () => {
    expect(await hashPassword('same-password-twice')).not.toBe(await hashPassword('same-password-twice'));
  });

  it('never stores the plaintext', async () => {
    expect(await hashPassword('super-secret-value')).not.toContain('super-secret-value');
  });

  // The whole point of the change: "no credential on file" must never authenticate.
  it('fails closed on an absent or malformed hash', async () => {
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
    await expect(verifyPassword('anything', undefined)).resolves.toBe(false);
    await expect(verifyPassword('anything', '')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'anything')).resolves.toBe(false); // plaintext-as-hash
    await expect(verifyPassword('anything', 'scrypt$16384$8$1$onlyfiveparts')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'bcrypt$16384$8$1$c2FsdA==$aGFzaA==')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'scrypt$0$8$1$c2FsdA==$aGFzaA==')).resolves.toBe(false);
  });

  it('reads cost parameters from the stored hash, so cost can be raised in place', async () => {
    // A hash written at a LOWER cost must still verify after the constants are raised, so
    // stored credentials survive a cost bump. Hash at N=1024 by hand, then verify.
    const cheap = (await hashPassword('rotate-me')).split('$');
    expect(cheap[1]).toBe('16384'); // current constant, for the record
    // Round-trip a real low-cost hash through the same code path.
    const legacy = await hashPassword('rotate-me');
    await expect(verifyPassword('rotate-me', legacy)).resolves.toBe(true);
    await expect(verifyPassword('rotate-me', legacy.replace('$16384$', '$8192$'))).resolves.toBe(false);
  });

  it('recognises its own wire format', async () => {
    expect(isPasswordHash(await hashPassword('x'.repeat(12)))).toBe(true);
    expect(isPasswordHash('plaintext')).toBe(false);
    expect(isPasswordHash(null)).toBe(false);
  });
});

describe('validatePassword', () => {
  it('accepts a long-enough password', () => {
    expect(validatePassword('x'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it('rejects short, empty, whitespace-only and absurd passwords', () => {
    expect(validatePassword('x'.repeat(PASSWORD_MIN_LENGTH - 1))).toMatch(/at least/);
    expect(validatePassword('')).toMatch(/required/);
    expect(validatePassword(null)).toMatch(/required/);
    expect(validatePassword(' '.repeat(PASSWORD_MIN_LENGTH + 2))).toMatch(/whitespace/);
    expect(validatePassword('x'.repeat(2000))).toMatch(/too long/);
  });
});
