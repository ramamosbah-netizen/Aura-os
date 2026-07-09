import { BadRequestException, Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { type TenantSetting, Permissions, SettingsService, TenantContext } from '@aura/core';

/**
 * Tenant settings admin (gap register Vol 23 #12). A generic key/value store for org-level
 * config (company name, default currency, invoice footer, …). Guarded by `admin.settings.manage`.
 */
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('admin.settings.manage')
  @Get()
  list(): Promise<TenantSetting[]> {
    return this.settings.list(this.tenant.get().tenantId);
  }

  @Permissions('admin.settings.manage')
  @Post()
  async set(@Body() dto: { key?: string; value?: string; description?: string }): Promise<{ ok: true }> {
    const key = dto?.key?.trim();
    if (!key) throw new BadRequestException('key is required');
    await this.settings.set(this.tenant.get().tenantId, key, String(dto.value ?? ''), dto.description?.trim() ?? '');
    return { ok: true };
  }

  @Permissions('admin.settings.manage')
  @Delete()
  async remove(@Query('key') key?: string): Promise<{ removed: boolean }> {
    if (!key?.trim()) throw new BadRequestException('key is required');
    return { removed: await this.settings.remove(this.tenant.get().tenantId, key.trim()) };
  }
}
