import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApprovalMatrixService, type ApprovalRule, Permissions, TenantContext } from '@aura/core';

/**
 * Approval-matrix admin (gap register Vol 23 #12). Read/replace the ordered approval rules
 * for an entity type (purchase-request, purchase-order, …) that `ApprovalMatrixService.resolve`
 * evaluates at runtime. Guarded by `admin.approvals.manage`.
 */
@Controller('admin/approval-matrix')
export class ApprovalMatrixAdminController {
  constructor(
    private readonly matrix: ApprovalMatrixService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('admin.approvals.manage')
  @Get()
  async get(@Query('entityType') entityType?: string): Promise<{ entityType: string; rules: ApprovalRule[] }> {
    const et = entityType?.trim() || 'purchase-request';
    const config = await this.matrix.getConfig(this.tenant.get().tenantId, et);
    return { entityType: et, rules: config?.rules ?? [] };
  }

  @Permissions('admin.approvals.manage')
  @Post()
  async save(@Body() dto: { entityType?: string; rules?: ApprovalRule[] }): Promise<{ ok: true; count: number }> {
    const entityType = dto?.entityType?.trim();
    if (!entityType) throw new BadRequestException('entityType is required');
    if (!Array.isArray(dto.rules)) throw new BadRequestException('rules must be an array');
    await this.matrix.configure({ tenantId: this.tenant.get().tenantId, entityType, rules: dto.rules });
    return { ok: true, count: dto.rules.length };
  }
}
