import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Permissions, TenantContext } from '@aura/core';
import { QuotationApprovalPolicyService } from '@aura/crm';

/**
 * Settings → Company Policies → Quotation Approval (EST-17). The tenant's Admin keeps the policy as
 * versions: start a draft, edit it, validate and preview it, activate it with a reason, or retire the
 * active one. Every write is logged with who, when, why, before and after. Nothing here grants a
 * role or a permission; the policy only names who must approve.
 */
@Controller('admin/company-policies/quotation-approval')
export class QuotationApprovalPolicyAdminController {
  constructor(private readonly policies: QuotationApprovalPolicyService, private readonly tenant: TenantContext) {}

  private actor(): string {
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('a signed-in administrator is required to change a company policy');
    return actorId;
  }

  @Get()
  @Permissions('admin.policies.manage')
  overview() {
    return this.policies.overview(this.tenant.get().tenantId);
  }

  @Post('drafts')
  @Permissions('admin.policies.manage')
  createDraft(@Body() dto: { reason?: string; from?: 'active' | 'owner-default' }) {
    return this.policies.createDraft({ tenantId: this.tenant.get().tenantId, actorId: this.actor(), reason: dto?.reason ?? '', from: dto?.from });
  }

  @Put('drafts/:version')
  @Permissions('admin.policies.manage')
  updateDraft(@Param('version') version: string, @Body() dto: { body?: unknown; reason?: string }) {
    return this.policies.updateDraft({ tenantId: this.tenant.get().tenantId, version: Number(version), body: dto?.body, actorId: this.actor(), reason: dto?.reason ?? '' });
  }

  @Post('validate')
  @Permissions('admin.policies.manage')
  async validate(@Body() dto: { body?: unknown }) {
    return { issues: await this.policies.validate(this.tenant.get().tenantId, dto?.body) };
  }

  @Post('preview')
  @Permissions('admin.policies.manage')
  preview(@Body() dto: { body?: unknown; offer?: { net?: number; gross?: number; marginPercent?: number | null; discountPercent?: number | null; manual?: boolean } }) {
    const offer = dto?.offer ?? {};
    const net = Number(offer.net ?? 0);
    return this.policies.preview(this.tenant.get().tenantId, dto?.body, {
      net, gross: Number(offer.gross ?? net), marginPercent: offer.marginPercent ?? null,
      discountPercent: offer.discountPercent ?? null, manual: Boolean(offer.manual),
    });
  }

  @Post('drafts/:version/activate')
  @Permissions('admin.policies.manage')
  activate(@Param('version') version: string, @Body() dto: { reason?: string }) {
    return this.policies.activate({ tenantId: this.tenant.get().tenantId, version: Number(version), actorId: this.actor(), reason: dto?.reason ?? '' });
  }

  @Post('retire')
  @Permissions('admin.policies.manage')
  retire(@Body() dto: { reason?: string }) {
    return this.policies.retire({ tenantId: this.tenant.get().tenantId, actorId: this.actor(), reason: dto?.reason ?? '' });
  }
}
