import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpException, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService, throttleFromEnv } from '@aura/core';
import { generateTotpSecret, totpAuthUri, verifyTotp } from '@aura/shared';

interface DevTokenDto {
  sub?: string;
  tenantId?: string;
  companyId?: string | null;
}

interface LoginDto {
  username?: string;
  password?: string;
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

  constructor(private readonly auth: AuthService) {}

  @Get('status')
  status(): { enabled: boolean } {
    return { enabled: this.auth.enabled };
  }

  @Post('login')
  login(@Body() dto: LoginDto): { token: string; user: { sub: string; tenantId: string } } {
    if (!this.auth.canMint) {
      throw new ForbiddenException('login (dev token mint) requires AUTH_JWT_SECRET');
    }
    const username = (dto.username ?? '').trim() || 'u-admin';

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
   * MFA enrolment (RFC 6238 TOTP). Returns a fresh secret + the otpauth URI an authenticator
   * app scans; the caller persists the secret against the user (Entra SSO users get MFA from
   * Entra, so this is the local-account path). Stateless — no secret is stored server-side here.
   */
  @Post('mfa/enroll')
  mfaEnroll(@Body() dto: { account?: string }): { secret: string; otpauthUri: string } {
    const secret = generateTotpSecret();
    const account = (dto?.account ?? '').trim() || 'user';
    return { secret, otpauthUri: totpAuthUri(secret, { label: account, issuer: process.env.MFA_ISSUER?.trim() || 'AURA' }) };
  }

  /** Verify a TOTP code against a (caller-supplied) secret — the check the login step calls. */
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
