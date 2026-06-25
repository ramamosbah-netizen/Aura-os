import { Injectable, Logger } from '@nestjs/common';
import {
  type AuthClaims,
  type Id,
  type Jwks,
  type JwtClaims,
  signJwt,
  verifyJwt,
  verifyJwtWithJwks,
} from '@aura/shared';
import type { TenantInfo } from '../tenancy/tenant-context';

/** Caches a hosted IdP's JWKS (public keys), refreshed on TTL or a key-miss (rotation). */
class JwksCache {
  private jwks: Jwks | null = null;
  private fetchedAt = 0;
  private readonly ttlMs = 10 * 60 * 1000;

  constructor(private readonly url: string) {}

  async get(force = false): Promise<Jwks | null> {
    if (!force && this.jwks && Date.now() - this.fetchedAt < this.ttlMs) return this.jwks;
    try {
      const res = await fetch(this.url);
      if (!res.ok) return this.jwks;
      const body = (await res.json()) as Jwks;
      if (Array.isArray(body?.keys)) {
        this.jwks = body;
        this.fetchedAt = Date.now();
      }
      return this.jwks;
    } catch {
      return this.jwks; // network blip — keep the cached keys
    }
  }
}

/**
 * The kernel auth seam. Verifies a bearer token into a request context, trying two
 * verifiers: a hosted-IdP JWKS (asymmetric RS/ES/EdDSA — e.g. Supabase) when AUTH_JWKS_URL
 * is set, then a self-issued HS256 token when AUTH_JWT_SECRET is set. When neither is
 * configured auth is OFF and requests run as the dev default (staged pass-through) — so
 * the API always boots, same shape as the AI/DB seams.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly secret = process.env.AUTH_JWT_SECRET?.trim() || null;
  private readonly jwksUrl = (process.env.AUTH_JWKS_URL ?? process.env.SUPABASE_JWKS_URL)?.trim() || null;
  private readonly jwksCache = this.jwksUrl ? new JwksCache(this.jwksUrl) : null;
  private readonly defaultTenant = process.env.AUTH_DEFAULT_TENANT?.trim() || 'dev-tenant';

  constructor() {
    const modes = [this.jwksCache ? 'JWKS (IdP)' : null, this.secret ? 'HS256 (self-issued)' : null].filter(Boolean);
    if (modes.length > 0) {
      this.logger.log(`Auth ON — verifying ${modes.join(' + ')}.`);
    } else {
      this.logger.warn('Auth OFF (no AUTH_JWKS_URL / AUTH_JWT_SECRET) — requests run as the dev default; access seam passes through.');
    }
  }

  /** Auth is on if any verifier is configured. */
  get enabled(): boolean {
    return this.secret !== null || this.jwksCache !== null;
  }

  /** Only the HS256 secret can mint tokens (the dev-login path); IdP tokens come from the IdP. */
  get canMint(): boolean {
    return this.secret !== null;
  }

  /** Verify an Authorization header into a request context, or null if absent/invalid. */
  async contextFromHeader(authorization: string | undefined): Promise<TenantInfo | null> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
    if (!token) return null;

    // 1. Hosted-IdP (asymmetric) token via JWKS.
    if (this.jwksCache) {
      let jwks = await this.jwksCache.get();
      let claims = jwks ? verifyJwtWithJwks(token, jwks) : null;
      if (!claims) {
        // Possibly a rotated signing key — refetch once and retry.
        jwks = await this.jwksCache.get(true);
        claims = jwks ? verifyJwtWithJwks(token, jwks) : null;
      }
      if (claims?.sub) return this.toContext(claims);
    }

    // 2. Self-issued HS256 (dev) token.
    if (this.secret) {
      const claims = verifyJwt(token, this.secret);
      if (claims?.sub && claims.tenantId) {
        return { tenantId: claims.tenantId, companyId: (claims.companyId ?? null) as Id | null, actorId: claims.sub };
      }
    }
    return null;
  }

  /**
   * Map verified IdP claims to a request context. Supabase tokens carry `sub` (the user
   * id) but no tenant — resolve it from a claim (`tenantId` or `app_metadata.tenant_id`)
   * or the configured default.
   */
  private toContext(claims: JwtClaims): TenantInfo {
    const appMeta = (claims.app_metadata ?? {}) as Record<string, unknown>;
    const tenantId =
      (typeof claims.tenantId === 'string' && claims.tenantId) ||
      (typeof appMeta.tenant_id === 'string' && appMeta.tenant_id) ||
      this.defaultTenant;
    const companyId =
      (typeof claims.companyId === 'string' && claims.companyId) ||
      (typeof appMeta.company_id === 'string' && appMeta.company_id) ||
      null;
    return { tenantId, companyId, actorId: String(claims.sub) };
  }

  /** Mint a token — used by the dev-login / dev-token endpoints. Throws if no HS256 secret. */
  mint(claims: AuthClaims, ttlSeconds = 3600): string {
    if (!this.secret) throw new Error('AUTH_JWT_SECRET not set — cannot mint tokens');
    return signJwt(claims, this.secret, ttlSeconds);
  }
}
