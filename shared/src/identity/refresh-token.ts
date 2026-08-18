import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Opaque refresh tokens (S2). Unlike the access token, a refresh token is NOT a JWT and carries
// no claims — it is a high-entropy random secret whose only meaning is "whoever holds this may
// rotate the session". The server stores ONLY its SHA-256 hash (see auth_refresh_tokens.token_hash),
// never the secret, so a database read cannot recover a usable token. The plaintext is returned to
// the client exactly once, at issuance, and delivered to a browser only via an HttpOnly cookie.
//
// SHA-256 (not scrypt/bcrypt) is deliberate and correct here: the input is 256 bits of CSPRNG
// output, not a low-entropy human password, so there is nothing to brute-force — a fast hash is
// the right tool, and it keeps the per-request refresh lookup cheap. Password hashing is slow on
// purpose to defend weak secrets; that reasoning does not apply to a random 256-bit token.

/** Bytes of entropy in a refresh token secret. 32 bytes = 256 bits. */
const TOKEN_BYTES = 32;

/** Mint a new opaque refresh-token secret (URL-safe, ~43 chars). Returned to the client ONCE. */
export function generateRefreshToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** The stored form: SHA-256 hex of the secret. Deterministic, so a presented token looks up its row. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time compare of two refresh-token hashes. Lookups are by exact hash (unique index), so
 * this is for the rare in-memory path and defence-in-depth — a hash comparison should not leak
 * timing about how many leading characters matched.
 */
export function refreshHashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
