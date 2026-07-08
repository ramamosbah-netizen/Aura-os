import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { Id } from '../domain/id';

// Minimal HS256 JWT — the same node:crypto dependency the webhook signer already uses.
// The kernel's auth seam: a bearer token carries the actor + tenant; the API verifies it
// and stamps the request context. Self-issued today; a hosted-IdP (Supabase/Auth0) JWKS
// verifier can implement the same verify() shape later with no consumer changes.

export interface AuthClaims {
  /** Subject — the actor (user) id. */
  sub: Id;
  tenantId: Id;
  companyId?: Id | null;
  /** JWT ID — unique per token; the handle used to revoke a specific token. */
  jti?: string;
  /** Seconds since epoch (stamped by signJwt). */
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** Encode + sign an HS256 JWT. `ttlSeconds` sets `exp` (default 1h; negative = already expired). */
export function signJwt(claims: AuthClaims, secret: string, ttlSeconds = 3600): string {
  const iat = Math.floor(Date.now() / 1000);
  const body: AuthClaims = { ...claims, jti: claims.jti ?? randomUUID(), iat, exp: iat + ttlSeconds };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(body));
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

/** Verify signature + expiry. Returns the claims, or null if invalid / expired / malformed. */
export function verifyJwt(token: string, secret: string): AuthClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims: AuthClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthClaims;
  } catch {
    return null;
  }
  if (typeof claims.exp === 'number' && claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}
