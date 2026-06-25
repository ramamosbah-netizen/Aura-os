// Session constants/helpers safe to import anywhere (no `next/headers`), so the
// proxy can share the cookie name. The token itself is an httpOnly cookie set by the
// login route; the browser never reads it.

export const SESSION_COOKIE = 'aura_session';

export interface SessionUser {
  sub: string;
  tenantId: string;
}

/**
 * Decode (NOT verify) a JWT's claims, for display only. The API does the real
 * cryptographic verification on every request — this just reads the username/tenant
 * to show in the frame.
 */
export function decodeSessionUser(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof json.sub === 'string') {
      return {
        sub: json.sub,
        tenantId: typeof json.tenantId === 'string' ? json.tenantId : 'dev-tenant',
      };
    }
  } catch {
    // malformed token — treat as signed-out
  }
  return null;
}
