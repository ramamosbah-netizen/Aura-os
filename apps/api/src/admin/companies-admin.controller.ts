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
    @Body() dto: {
      id?: string; name?: string; code?: string; trn?: string; baseCurrency?: string; active?: boolean;
      legalName?: string; address?: string; phone?: string; email?: string; website?: string;
    },
  ): Promise<Company> {
    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    const tenantId = this.tenant.get().tenantId;
    const id = dto?.id?.trim() || `company-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
    // MERGE, field by field: a field the request does not carry keeps what the company already has.
    // Replacing the whole record meant any client that did not send the TRN (or, now, the address)
    // erased it — a letterhead lost to an edit of the company's code.
    const existing = (await this.companies.list(tenantId)).find((company) => company.id === id);
    const field = (sent: string | undefined, kept: string | undefined): string => (sent !== undefined ? sent.trim() : kept ?? '');
    return this.companies.upsert({
      id,
      tenantId,
      name,
      code: field(dto?.code, existing?.code),
      trn: field(dto?.trn, existing?.trn),
      baseCurrency: dto?.baseCurrency?.trim() || existing?.baseCurrency || 'AED',
      active: dto?.active !== undefined ? dto.active !== false : existing?.active ?? true,
      legalName: field(dto?.legalName, existing?.legalName),
      address: field(dto?.address, existing?.address),
      phone: field(dto?.phone, existing?.phone),
      email: field(dto?.email, existing?.email),
      website: field(dto?.website, existing?.website),
    });
  }

  @Permissions('admin.companies.manage')
  @Delete()
  async remove(@Query('id') id?: string): Promise<{ removed: boolean }> {
    if (!id?.trim()) throw new BadRequestException('id is required');
    return { removed: await this.companies.remove(this.tenant.get().tenantId, id.trim()) };
  }
}
