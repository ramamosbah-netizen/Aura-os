import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { type ConnectorSummary, ConnectorService, Permissions, TenantContext } from '@aura/core';

/**
 * Integration connectors admin (gap register Vol 23 #12). List/register/enable external-system
 * connectors. Listing NEVER returns authConfig (secrets are write-only from here). Guarded by
 * `admin.connectors.manage`.
 */
@Controller('admin/connectors')
export class ConnectorsAdminController {
  constructor(
    private readonly connectors: ConnectorService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('admin.connectors.manage')
  @Get()
  list(): Promise<ConnectorSummary[]> {
    return this.connectors.listConnectors(this.tenant.get().tenantId);
  }

  @Permissions('admin.connectors.manage')
  @Post()
  async register(@Body() dto: { systemName?: string; authConfig?: unknown; mappingRules?: Record<string, string>; enabled?: boolean }): Promise<{ id: string }> {
    const systemName = dto?.systemName?.trim();
    if (!systemName) throw new BadRequestException('systemName is required');
    const id = await this.connectors.registerConnector({
      tenantId: this.tenant.get().tenantId,
      systemName,
      authConfig: dto.authConfig ?? {},
      mappingRules: dto.mappingRules ?? {},
      enabled: dto.enabled !== false,
    });
    return { id };
  }

  @Permissions('admin.connectors.manage')
  @Patch(':id')
  async setEnabled(@Param('id') id: string, @Body() dto: { enabled?: boolean }): Promise<{ ok: true }> {
    const ok = await this.connectors.setEnabled(this.tenant.get().tenantId, id, dto?.enabled !== false);
    if (!ok) throw new NotFoundException(`connector ${id} not found`);
    return { ok: true };
  }
}
