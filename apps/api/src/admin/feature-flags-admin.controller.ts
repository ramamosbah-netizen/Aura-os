import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { type FeatureFlag, type FlagRule, FeatureFlagService, Permissions } from '@aura/core';

/**
 * Feature-flags admin (gap register Vol 23 #12). List flags and set a flag's default +
 * per-tenant overrides — the toggles that gate staged/rolled-out capabilities. Guarded by
 * `admin.flags.manage`.
 */
@Controller('admin/feature-flags')
export class FeatureFlagsAdminController {
  constructor(private readonly flags: FeatureFlagService) {}

  @Permissions('admin.flags.manage')
  @Get()
  list(): Promise<FeatureFlag[]> {
    return this.flags.listFlags();
  }

  @Permissions('admin.flags.manage')
  @Post()
  async set(@Body() dto: { flagKey?: string; enabledDefault?: boolean; description?: string; rules?: FlagRule[] }): Promise<{ ok: true }> {
    const flagKey = dto?.flagKey?.trim();
    if (!flagKey) throw new BadRequestException('flagKey is required');
    const rules = Array.isArray(dto.rules) ? dto.rules : [];
    await this.flags.setFlag(flagKey, dto.enabledDefault === true, rules, dto.description);
    return { ok: true };
  }
}
