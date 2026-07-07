import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '@aura/core';
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
    // Dev credential policy: require AUTH_DEV_PASSWORD when set, otherwise accept any.
    // This is the stand-in for the hosted-IdP login that will issue the real token.
    const expected = process.env.AUTH_DEV_PASSWORD?.trim();
    if (expected && dto.password !== expected) {
      throw new UnauthorizedException('invalid credentials');
    }
    const tenantId = 'dev-tenant';
    return {
      token: this.auth.mint({ sub: username, tenantId, companyId: null }),
      user: { sub: username, tenantId },
    };
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
