import crypto from 'node:crypto';

// Password hashing for local accounts. Until now AURA had none: `POST /auth/login`
// compared the submitted password against a single deployment-wide `AUTH_DEV_PASSWORD`
// env var, and accepted ANY password when that var was unset. This is the primitive
// behind a real per-user credential (see core/src/identity/credentials.service.ts).
//
// scrypt, from node:crypto — deliberately no new dependency. scrypt is memory-hard and
// is the hash Node ships for exactly this purpose; bcrypt/argon2 would each pull a
// native build into every workspace that imports @aura/shared.
//
// ASYNC on purpose. A correctly-costed hash is ~50-100ms of pure CPU, and `scryptSync`
// spends every one of those milliseconds with the event loop blocked — one login stalls
// every other in-flight request on the node. `crypto.scrypt` runs on the libuv threadpool
// instead, so the cost is paid off the event loop.
//
// Wire format: scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
//  - versioned by its own parameters, so cost can be raised without a migration:
//    verification reads N/r/p from the stored string, only new hashes use the constants;
//  - the comparison is timing-safe;
//  - anything not matching the format fails closed (never "no hash ⇒ allow").

/** scrypt cost. N=16384 (2^14) is the Node default; ~50-100ms per hash on server hardware. */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
/** scrypt needs ~128*N*r bytes; the default 32MB maxmem is under that at N=16384, r=8. */
const MAX_MEM = 64 * 1024 * 1024;

/** Minimum length for a new password. Deliberately modest — length is the only rule we enforce. */
export const PASSWORD_MIN_LENGTH = 12;

function derive(plain: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(plain.normalize('NFKC'), salt, KEY_LEN, { N: n, r, p, maxmem: MAX_MEM }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Hash a password for storage. Each call salts freshly, so the same password hashes differently. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = await derive(plain, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Verify a password against a stored hash. False for a malformed/absent hash — the caller
 * can never accidentally turn "this account has no credential" into a successful login.
 */
export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!plain || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || n <= 1 || r < 1 || p < 1) {
    return false;
  }
  try {
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await derive(plain, Buffer.from(saltB64, 'base64'), n, r, p);
    // timingSafeEqual throws on a length mismatch, so guard it — a stored hash of a
    // different key length is simply not a match.
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Does this string look like a stored scrypt hash (rather than a plaintext leak)? */
export function isPasswordHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('scrypt$') && value.split('$').length === 6;
}

/**
 * Policy check for a NEW password. Returns null when acceptable, else the reason to show
 * the user. Enforced on the set/change paths only — never on login, where an existing
 * short password must still be able to sign in (and then be changed).
 */
export function validatePassword(plain: string | null | undefined): string | null {
  if (typeof plain !== 'string' || plain.length === 0) return 'password is required';
  if (plain.length < PASSWORD_MIN_LENGTH) {
    return `password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (plain.length > 1024) return 'password is too long';
  if (plain.trim().length === 0) return 'password cannot be only whitespace';
  return null;
}

/**
 * Burn roughly one password-verification's worth of CPU. Awaited when an account does not
 * exist or carries no credential, so "unknown user" and "wrong password" take comparable
 * time and the login endpoint does not become a user-enumeration oracle.
 */
export async function dummyVerify(): Promise<void> {
  await derive('aura-dummy-verify', Buffer.alloc(SALT_LEN, 7), N, R, P);
}
