import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, HttpException, HttpStatus, Post, Query, UnauthorizedException } from '@nestjs/common';
import { AuditService, AuthService, AuthenticationService, CredentialsService, MfaService, Permissions, TenantContext, UsersService, type AuthSession } from '@aura/core';
import { generateTotpSecret, totpAuthUri, verifyTotp } from '@aura/shared';

interface DevTokenDto {
  sub?: string;
  tenantId?: string;
  companyId?: string | null;
}

interface LoginDto {
  username?: string;
  password?: string;
  /** Tenant to sign in to. Defaults to AUTH_DEFAULT_TENANT (`dev-tenant` when unset). */
  tenantId?: string;
}

interface LoginResponse {
  token: string;
  /** Opaque refresh token (S2). The web BFF moves this into an HttpOnly `aura_refresh` cookie. */
  refreshToken: string;
  user: { sub: string; tenantId: string };
  expiresIn: number;
}

/**
 * The single response body for every pre-session authentication failure.
 *
 * Unknown account, deactivated account, no credential on file, wrong password, suspended
 * credential, locked-out credential — all produce this exact object, byte for byte. Same
 * status, same `error`, same `message`. Matching only the status code is not enough: a
 * differing message or an extra field is just as good an enumeration oracle as a 404.
 *
 * "Temporarily locked" is deliberately included: only a real account can be locked, so
 * saying so confirms the username. A genuinely locked-out user learns it from their
 * administrator — that is a support path, not a login response.
 */
const INVALID_CREDENTIALS = { statusCode: 401, error: 'Unauthorized', message: 'Invalid credentials' } as const;

function invalidCredentials(): HttpException {
  return new HttpException({ ...INVALID_CREDENTIALS }, HttpStatus.UNAUTHORIZED);
}

/**
 * Authentication endpoints (S1 of the auth rebuild). HTTP mapping ONLY — no flow logic and
 * no token minting. `AuthenticationService` composes identity → credential → MFA, and
 * `SessionService` is the one thing that issues a session; keeping both out of here means
 * session policy is not re-decided at the HTTP boundary.
 *
 * What this replaced: a comparison against a single deployment-wide `AUTH_DEV_PASSWORD`
 * that accepted ANY password when the var was unset, for a username that defaulted to
 * `u-admin` — so an empty POST body minted a wildcard platform-admin token. Identity was
 * never resolved; an unregistered username authenticated because `isActive()` answers
 * `true` for ids it has never seen.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly authentication: AuthenticationService,
    private readonly mfa: MfaService,
    private readonly users: UsersService,
    private readonly credentials: CredentialsService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  @Get('status')
  status(): { enabled: boolean } {
    return { enabled: this.auth.enabled };
  }

  /**
   * Step 1 of sign-in: identifier + password.
   *
   * Returns a token ONLY when the account has no outstanding second factor and no forced
   * password change. Otherwise it returns a challenge for the client to answer — there is
   * no branch here that produces a token from a partial authentication.
   *
   * The sign-in contract is stated explicitly rather than inherited from Nest's POST
   * default: authenticating is not resource creation, so `201` would be an accident of the
   * framework rather than a decision. Across all three sign-in steps:
   *   success or challenge → 200 · invalid credentials → 401 · rate limited → 429.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<LoginResponse | { challenge: string; challengeId: string }> {
    if (!this.auth.canMint) {
      throw new ForbiddenException('password login requires AUTH_JWT_SECRET');
    }
    const tenantId = (dto.tenantId ?? '').trim() || process.env.AUTH_DEFAULT_TENANT?.trim() || 'dev-tenant';

    // AuthenticationService binds this tenant into TenantContext for the attempt — see the
    // note there on why an unauthenticated request must still carry a tenant.
    const result = await this.authentication.authenticate({
      tenantId,
      identifier: (dto.username ?? '').trim(),
      password: dto.password ?? '',
    });
    return this.render(result);
  }

  /**
   * Step 2: answer an MFA challenge. The only path from an enrolled account to a token.
   *
   * `tenantId` is re-supplied (defaulting exactly as `login` does) so the RLS-scoped challenge
   * store can find the challenge — it is an untrusted scoping key, not an authorization claim.
   */
  @Post('login/mfa')
  @HttpCode(HttpStatus.OK)
  async loginMfa(@Body() dto: { challengeId?: string; code?: string; tenantId?: string }): Promise<LoginResponse | { challenge: string; challengeId: string }> {
    const tenantId = (dto?.tenantId ?? '').trim() || process.env.AUTH_DEFAULT_TENANT?.trim() || 'dev-tenant';
    const result = await this.authentication.completeMfa(tenantId, (dto?.challengeId ?? '').trim(), dto?.code ?? '');
    return this.render(result);
  }

  /** Step 2': satisfy a forced password change, which then issues the session. */
  @Post('login/password-change')
  @HttpCode(HttpStatus.OK)
  async loginPasswordChange(
    @Body() dto: { challengeId?: string; newPassword?: string; tenantId?: string },
  ): Promise<LoginResponse | { challenge: string; challengeId: string }> {
    const tenantId = (dto?.tenantId ?? '').trim() || process.env.AUTH_DEFAULT_TENANT?.trim() || 'dev-tenant';
    const result = await this.authentication.completePasswordChange(
      tenantId,
      (dto?.challengeId ?? '').trim(),
      dto?.newPassword ?? '',
    );
    if (result.kind === 'rejected') throw new BadRequestException(result.message);
    return this.render(result);
  }

  /**
   * Change your own password while signed in. Requires the current one, so a stolen
   * *session* cannot be escalated into a permanent credential. The account comes from the
   * authenticated principal — never from the body.
   */
  @Post('password')
  async changePassword(
    @Body() dto: { currentPassword?: string; newPassword?: string },
  ): Promise<{ changed: boolean }> {
    const { tenantId, actorId } = this.tenant.get();
    if (!actorId) throw new UnauthorizedException('sign in to change your password');
    const current = dto?.currentPassword ?? '';
    const next = dto?.newPassword ?? '';
    if (!current || !next) throw new BadRequestException('currentPassword and newPassword are required');
    if (current === next) throw new BadRequestException('new password must differ from the current one');

    const verification = await this.credentials.verifyPasswordFor(tenantId, actorId, current);
    if (!verification.ok) throw new UnauthorizedException('current password is incorrect');

    try {
      await this.credentials.setPassword(tenantId, actorId, next, { mustChange: false });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    await this.audit.log(tenantId, null, actorId, 'auth', 'user', actorId, 'password.changed', {}, { self: true });
    return { changed: true };
  }

  /** Sliding-session refresh — exchange a still-valid token for a fresh one. */
  /**
   * Rotate an OPAQUE refresh token into a fresh access + refresh pair. The refresh token comes in
   * the body (the web BFF reads it from the HttpOnly `aura_refresh` cookie); `tenantId` is an
   * untrusted scoping key, exactly like login. This replaced the transitional "refresh a JWT with a
   * JWT": rotation, replay containment, session-liveness and idle all live server-side now.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: { refreshToken?: string; tenantId?: string },
  ): Promise<{ token: string; refreshToken: string; expiresIn: number }> {
    const tenantId = (dto?.tenantId ?? '').trim() || process.env.AUTH_DEFAULT_TENANT?.trim() || 'dev-tenant';
    const outcome = await this.authentication.refreshSession(tenantId, (dto?.refreshToken ?? '').trim());
    if (outcome.kind !== 'refreshed') {
      throw new UnauthorizedException('cannot refresh — token missing, invalid, expired, or revoked');
    }
    return { token: outcome.accessToken, refreshToken: outcome.refreshToken, expiresIn: outcome.expiresInSeconds };
  }

  /**
   * Logout — SERVER-SIDE revocation. Kills the session named by the token's `sid` so every
   * still-valid access token carrying it is refused at the boundary, and also denylists this
   * token's jti (transitional, immediate on this node). Either one succeeding counts as revoked.
   */
  @Post('logout')
  async logout(@Headers('authorization') authorization?: string): Promise<{ revoked: boolean }> {
    const sessionRevoked = await this.auth.revokeSession(authorization);
    const tokenRevoked = this.auth.revoke(authorization);
    return { revoked: sessionRevoked || tokenRevoked };
  }

  /**
   * Enrol YOUR OWN account in TOTP MFA. Generates a secret, parks it *inactive*, and
   * returns the otpauth URI an authenticator app scans; the first valid code POSTed to
   * `mfa/activate` switches it on.
   *
   * The account comes from the authenticated principal and cannot be named in the body.
   * This endpoint was unauthenticated and took `{ account }` from the request, so anyone
   * could park — then activate, holding the secret they had just been handed — an
   * enrolment on someone else's account and lock them out of it. Administrator reset is a
   * separate, permissioned, audited path.
   */
  @Post('mfa/enroll')
  async mfaEnroll(): Promise<{ secret: string; otpauthUri: string }> {
    const account = this.principal();
    const { tenantId } = this.tenant.get();
    const secret = generateTotpSecret();
    await this.mfa.enroll(tenantId, account, secret);
    return { secret, otpauthUri: totpAuthUri(secret, { label: account, issuer: process.env.MFA_ISSUER?.trim() || 'AURA' }) };
  }

  /** Confirm your own enrolment: the first valid code activates MFA (gap #13). */
  @Post('mfa/activate')
  async mfaActivate(@Body() dto: { code?: string }): Promise<{ active: boolean }> {
    const account = this.principal();
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    const { tenantId } = this.tenant.get();
    const active = await this.mfa.activate(tenantId, account, dto.code.trim());
    if (!active) throw new UnauthorizedException('invalid code — MFA not activated');
    await this.audit.log(tenantId, null, account, 'auth', 'user', account, 'mfa.activated', {}, { self: true });
    return { active };
  }

  /** Admin reset: remove a user's MFA enrolment (device loss). Guarded like the access admin. */
  @Permissions('admin.access.manage')
  @Delete('mfa')
  async mfaReset(@Query('account') account?: string): Promise<{ removed: boolean }> {
    if (!account?.trim()) throw new BadRequestException('account is required');
    const target = account.trim();
    const { tenantId, actorId } = this.tenant.get();
    const removed = await this.mfa.disable(tenantId, target);
    await this.audit.log(tenantId, null, actorId, 'auth', 'user', target, 'mfa.reset', {}, { by: actorId });
    return { removed };
  }

  /** Verify a TOTP code against a (caller-supplied) secret — kept for stateless checks. */
  @Post('mfa/verify')
  mfaVerify(@Body() dto: { secret?: string; code?: string }): { valid: boolean } {
    if (!dto?.secret?.trim()) throw new BadRequestException('secret is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    return { valid: verifyTotp(dto.secret.trim(), dto.code.trim()) };
  }

  @Post('dev-token')
  devToken(@Body() dto: DevTokenDto): { token: string } {
    if (process.env.AUTH_ALLOW_DEV_TOKENS !== 'true') {
      throw new ForbiddenException('dev token minting is disabled');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('dev token minting is not available in production');
    }
    if (!this.auth.canMint) {
      throw new ForbiddenException('auth is off (set AUTH_JWT_SECRET)');
    }
    return {
      token: this.auth.mint({
        sub: dto.sub ?? 'u-admin',
        tenantId: dto.tenantId ?? 'dev-tenant',
        companyId: dto.companyId ?? null,
      }),
    };
  }

  /**
   * Map an authentication result to HTTP. The `invalid_credentials` arm is the ONLY place
   * a refusal is rendered, so every denial necessarily shares one body — the service does
   * not hand out a reason that could accidentally be spliced in here.
   */
  private render(
    result: Awaited<ReturnType<AuthenticationService['authenticate']>>,
  ): LoginResponse | { challenge: string; challengeId: string } {
    switch (result.kind) {
      case 'authenticated':
        return this.session(result.session);
      case 'mfa_required':
        return { challenge: 'mfa', challengeId: result.challengeId };
      case 'password_change_required':
        return { challenge: 'password_change', challengeId: result.challengeId };
      default:
        throw invalidCredentials();
    }
  }

  private session(session: AuthSession): LoginResponse {
    return {
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user: { sub: session.userId, tenantId: session.tenantId },
      expiresIn: session.expiresInSeconds,
    };
  }

  /**
   * The authenticated principal's account id, for endpoints that act on "me".
   *
   * The `auth` module is exempt from the PermissionsGuard's route-derived permissions —
   * it has to be, since `login` is how a token is obtained — so these routes carry their
   * own check. When auth is off entirely, the whole access seam passes through and the
   * dev actor is used, exactly as the guard does.
   */
  private principal(): string {
    const { actorId } = this.tenant.get();
    if (!actorId) {
      if (!this.auth.enabled) return 'dev-actor';
      throw new UnauthorizedException('sign in first');
    }
    return actorId;
  }
}
