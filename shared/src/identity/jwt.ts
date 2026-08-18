import { createHmac, timingSafeEqual } from 'node:crypto';
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
  /**
   * Session id (S2) — the `auth_sessions` row this access token belongs to. The verification
   * boundary checks the named session is still live, so revoking the session invalidates every
   * still-signature-valid access token that carries this `sid`, before its own `exp`.
   */
  sid?: string;
  /**
   * JWT ID — OPT-IN only. Self-issued access tokens no longer carry one: revocation is by session
   * (`sid`) and by the opaque refresh family, so a per-token id had no remaining use and was
   * dropped (final access token = {sub, tenantId, sid, iat, exp}). Verifiers still honour a `jti`
   * when a hosted IdP includes one.
   */
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

/**
 * Encode + sign an HS256 JWT. `ttlSeconds` sets `exp` (default 1h; negative = already expired).
 * `jti` is OPT-IN — included only if the caller passes one; it is no longer auto-generated, so a
 * self-issued access token is exactly `{sub, tenantId, sid?, iat, exp}` and nothing more.
 */
export function signJwt(claims: AuthClaims, secret: string, ttlSeconds = 3600): string {
  const iat = Math.floor(Date.now() / 1000);
  const body: AuthClaims = { ...claims, iat, exp: iat + ttlSeconds };
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
