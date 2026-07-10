import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, HttpException, HttpStatus, Post, Query, UnauthorizedException } from '@nestjs/common';
import { AuthService, MfaService, Permissions, UsersService, throttleFromEnv } from '@aura/core';
import { generateTotpSecret, totpAuthUri, verifyTotp } from '@aura/shared';

interface DevTokenDto {
  sub?: string;
  tenantId?: string;
  companyId?: string | null;
}

interface LoginDto {
  username?: string;
  password?: string;
  /** TOTP code — required once the account has an *active* MFA enrolment (gap #13). */
  code?: string;
}

/**
 * Auth status + a DEV-ONLY token mint (gated by AUTH_ALLOW_DEV_TOKENS) so the API can be
 * exercised with real identities before a login UI exists. Never enable in production —
 * this is the stand-in for the future hosted-IdP login that issues the real token.
 */
@Controller('auth')
export class AuthController {
  /** Per-node brute-force lockout for the login endpoint (config via AUTH_LOCKOUT_*). */
  private readonly throttle = throttleFromEnv();

  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly users: UsersService,
  ) {}

  @Get('status')
  status(): { enabled: boolean } {
    return { enabled: this.auth.enabled };
  }

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<{ token: string; user: { sub: string; tenantId: string } }> {
    if (!this.auth.canMint) {
      throw new ForbiddenException('login (dev token mint) requires AUTH_JWT_SECRET');
    }
    const username = (dto.username ?? '').trim() || 'u-admin';

    // Users registry (Vol 15 §2.2): a deactivated account cannot log in at all.
    if (!this.users.isActive('dev-tenant', username)) {
      throw new UnauthorizedException('account is deactivated — contact an administrator');
    }

    // Brute-force lockout: refuse while locked, count failures, clear on success.
    const lock = this.throttle.status(username);
    if (lock.locked) {
      throw new HttpException(
        `account temporarily locked — retry in ${Math.ceil(lock.retryAfterMs / 1000)}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Dev credential policy: require AUTH_DEV_PASSWORD when set, otherwise accept any.
    // This is the stand-in for the hosted-IdP login that will issue the real token.
    const expected = process.env.AUTH_DEV_PASSWORD?.trim();
    if (expected && dto.password !== expected) {
      const after = this.throttle.recordFailure(username);
      if (after.locked) {
        throw new HttpException('account locked after too many failed attempts', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new UnauthorizedException('invalid credentials');
    }

    // MFA gate (gap #13): an account with an *active* TOTP enrolment must present a code.
    // Bad codes count toward the same lockout as bad passwords.
    const mfaSecret = await this.mfa.activeSecret(username);
    if (mfaSecret) {
      if (!dto.code?.trim()) {
        throw new UnauthorizedException('mfa code required');
      }
      if (!verifyTotp(mfaSecret, dto.code.trim())) {
        const after = this.throttle.recordFailure(username);
        if (after.locked) {
          throw new HttpException('account locked after too many failed attempts', HttpStatus.TOO_MANY_REQUESTS);
        }
        throw new UnauthorizedException('invalid mfa code');
      }
    }

    this.throttle.reset(username);
    const tenantId = 'dev-tenant';
    return {
      token: this.auth.mint({ sub: username, tenantId, companyId: null }),
      user: { sub: username, tenantId },
    };
  }

  /** Sliding-session refresh — exchange a still-valid token for a fresh one. */
  @Post('refresh')
  refresh(@Headers('authorization') authorization?: string): { token: string } {
    const token = this.auth.refresh(authorization);
    if (!token) throw new UnauthorizedException('cannot refresh — token missing, invalid, or revoked');
    return { token };
  }

  /** Logout — revoke the presented token by its jti so it can no longer authenticate. */
  @Post('logout')
  logout(@Headers('authorization') authorization?: string): { revoked: boolean } {
    return { revoked: this.auth.revoke(authorization) };
  }

  /**
   * MFA enrolment (RFC 6238 TOTP). Generates a secret, parks it *inactive* against the
   * account, and returns it with the otpauth URI an authenticator app scans. The first
   * valid code POSTed to `mfa/activate` switches it on — from then login requires a code.
   * (Entra SSO users get MFA from Entra; this is the local-account path.)
   */
  @Post('mfa/enroll')
  async mfaEnroll(@Body() dto: { account?: string }): Promise<{ secret: string; otpauthUri: string }> {
    const account = (dto?.account ?? '').trim();
    if (!account) throw new BadRequestException('account is required');
    const secret = generateTotpSecret();
    await this.mfa.enroll(account, secret);
    return { secret, otpauthUri: totpAuthUri(secret, { label: account, issuer: process.env.MFA_ISSUER?.trim() || 'AURA' }) };
  }

  /** Confirm enrolment: the first valid code activates MFA for the account (gap #13). */
  @Post('mfa/activate')
  async mfaActivate(@Body() dto: { account?: string; code?: string }): Promise<{ active: boolean }> {
    if (!dto?.account?.trim()) throw new BadRequestException('account is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    const active = await this.mfa.activate(dto.account.trim(), dto.code.trim());
    if (!active) throw new UnauthorizedException('invalid code — MFA not activated');
    return { active };
  }

  /** Admin reset: remove a user's MFA enrolment (device loss). Guarded like the access admin. */
  @Permissions('admin.access.manage')
  @Delete('mfa')
  async mfaReset(@Query('account') account?: string): Promise<{ removed: boolean }> {
    if (!account?.trim()) throw new BadRequestException('account is required');
    return { removed: await this.mfa.disable(account.trim()) };
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
}
