import { BadRequestException, Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { type Company, CompaniesService, Permissions, TenantContext } from '@aura/core';

/**
 * Companies master admin (Admin Center phase 2, Vol 15 §2.1). CRUD for the multi-company
 * registry the app-shell switcher and per-company documents hang off. Guarded by
 * `admin.companies.manage`.
 */
@Controller('admin/companies')
export class CompaniesAdminController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('admin.companies.manage')
  @Get()
  list(): Promise<Company[]> {
    return this.companies.list(this.tenant.get().tenantId);
  }

  @Permissions('admin.companies.manage')
  @Post()
  async upsert(
    @Body() dto: { id?: string; name?: string; code?: string; trn?: string; baseCurrency?: string; active?: boolean },
  ): Promise<Company> {
    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    const id = dto?.id?.trim() || `company-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
    return this.companies.upsert({
      id,
      tenantId: this.tenant.get().tenantId,
      name,
      code: dto?.code?.trim() ?? '',
      trn: dto?.trn?.trim() ?? '',
      baseCurrency: dto?.baseCurrency?.trim() || 'AED',
      active: dto?.active !== false,
    });
  }

  @Permissions('admin.companies.manage')
  @Delete()
  async remove(@Query('id') id?: string): Promise<{ removed: boolean }> {
    if (!id?.trim()) throw new BadRequestException('id is required');
    return { removed: await this.companies.remove(this.tenant.get().tenantId, id.trim()) };
  }
}
