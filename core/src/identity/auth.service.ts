import { Injectable, Logger } from '@nestjs/common';
import { type AuthClaims, type Id, signJwt, verifyJwt } from '@aura/shared';
import type { TenantInfo } from '../tenancy/tenant-context';

/**
 * The kernel auth seam. Verifies a bearer token into a request context. Self-issued
 * HS256 today (AUTH_JWT_SECRET); a hosted-IdP JWKS verifier implements the same shape
 * later. When no secret is configured auth is OFF and requests run as the dev default
 * (the staged-hardening pass-through) — so the API always boots, same as the AI/DB seams.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly secret = process.env.AUTH_JWT_SECRET?.trim() || null;

  constructor() {
    if (this.secret) this.logger.log('Auth ON — bearer tokens verified (HS256).');
    else this.logger.warn('No AUTH_JWT_SECRET — auth OFF (requests run as the dev default; access seam passes through).');
  }

  get enabled(): boolean {
    return this.secret !== null;
  }

  /** Verify an Authorization header into a request context, or null if absent/invalid. */
  contextFromHeader(authorization: string | undefined): TenantInfo | null {
    if (!this.secret) return null;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
    if (!token) return null;
    const claims = verifyJwt(token, this.secret);
    if (!claims?.sub || !claims.tenantId) return null;
    return { tenantId: claims.tenantId, companyId: (claims.companyId ?? null) as Id | null, actorId: claims.sub };
  }

  /** Mint a token — used by the gated dev-token endpoint and tests. Throws if auth is off. */
  mint(claims: AuthClaims, ttlSeconds = 3600): string {
    if (!this.secret) throw new Error('AUTH_JWT_SECRET not set — cannot mint tokens');
    return signJwt(claims, this.secret, ttlSeconds);
  }
}
