import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { AuthService } from '@aura/core';

interface DevTokenDto {
  sub?: string;
  tenantId?: string;
  companyId?: string | null;
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

  @Post('dev-token')
  devToken(@Body() dto: DevTokenDto): { token: string } {
    if (process.env.AUTH_ALLOW_DEV_TOKENS !== 'true') {
      throw new ForbiddenException('dev token minting is disabled');
    }
    if (!this.auth.enabled) {
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
