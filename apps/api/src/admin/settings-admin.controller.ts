import { BadRequestException, Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { type TenantSetting, AuditService, Permissions, SettingsService, TenantContext } from '@aura/core';

/**
 * Tenant settings admin (gap register Vol 23 #12). A generic key/value store for org-level
 * config (company name, default currency, invoice footer, …). Guarded by `admin.settings.manage`.
 */
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
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
    const ctx = this.tenant.get();
    await this.settings.set(ctx.tenantId, key, String(dto.value ?? ''), dto.description?.trim() ?? '');
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'setting', key, 'updated', { value: String(dto.value ?? '') });
    return { ok: true };
  }

  @Permissions('admin.settings.manage')
  @Delete()
  async remove(@Query('key') key?: string): Promise<{ removed: boolean }> {
    if (!key?.trim()) throw new BadRequestException('key is required');
    const ctx = this.tenant.get();
    const removed = await this.settings.remove(ctx.tenantId, key.trim());
    if (removed) void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'setting', key.trim(), 'deleted', {});
    return { removed };
  }
}
