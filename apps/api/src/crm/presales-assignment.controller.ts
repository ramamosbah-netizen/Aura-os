import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { AccessService, ParseUuidOr404Pipe, Permissions, TenantContext, UsersService } from '@aura/core';
import { OpportunityService, PreSalesAssignmentService } from '@aura/crm';

export class AssignPreSalesDto {
  @IsString() assigneeId!: string;
  @IsString() reviewerId!: string;
  @IsString() inputRevision!: string;
  @IsString() dueDate!: string;
  @IsArray() @IsString({ each: true }) deliverables!: string[];
}

export class ReissuePreSalesDto {
  @IsString() reason!: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() reviewerId?: string;
  @IsOptional() @IsString() inputRevision?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) deliverables?: string[];
}

/**
 * The Pre-Sales study assignment on a DIRECT opportunity (STU-01, the owner's decision of
 * 2026-09-26). Sales assigns and reissues it — a deal-team act, under the deal-team grant. The
 * engineer answers it, and Sales receives the approved study, in My Work (work-items). The study
 * routes enforce the binding (pre-award-package.controller).
 */
@Controller('crm')
export class PreSalesAssignmentController {
  constructor(
    private readonly assignments: PreSalesAssignmentService,
    private readonly opportunities: OpportunityService,
    private readonly tenant: TenantContext,
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  private orgPath(tenantId: string, companyId: string | null) {
    return [{ level: 'tenant' as const, id: tenantId }, ...(companyId ? [{ level: 'company' as const, id: companyId }] : [])];
  }

  /**
   * Who Sales can assign, read under the deal-team grant. Sales could not pick anybody before: the
   * convert drawer read the full user directory, which needs workspace.user.read — a grant no Sales
   * role holds — so both lists were empty and a lead could not be converted on screen.
   */
  @Get('presales-candidates')
  @Permissions('crm.opportunity.deal-team')
  async candidates() {
    const ctx = this.tenant.get();
    await this.users.ensureTenant(ctx.tenantId);
    const orgPath = this.orgPath(ctx.tenantId, ctx.companyId ?? null);
    const active = this.users.list(ctx.tenantId).filter((user) => user.active);
    const holding = (permission: string) => active
      .filter((user) => this.access.can(user.userId, { permission, orgPath }).allowed)
      .map((user) => ({ userId: user.userId, displayName: user.displayName }));
    return { engineers: holding('crm.study.create'), reviewers: holding('crm.study.approve') };
  }

  @Get('opportunities/:id/presales-assignment')
  @Permissions('crm.opportunity.read')
  async read(@Param('id', ParseUuidOr404Pipe) id: string) {
    const ctx = this.tenant.get();
    await this.directOpportunity(id);
    return { assignment: await this.assignments.forOpportunity(ctx.tenantId, id) };
  }

  @Post('opportunities/:id/presales-assignment')
  @Permissions('crm.opportunity.deal-team')
  async assign(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AssignPreSalesDto) {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new BadRequestException('an authenticated Sales user is required to assign Pre-Sales work');
    const opp = await this.directOpportunity(id);
    const [assigneeName, reviewerName] = await this.eligible(ctx.tenantId, opp.companyId ?? null, dto.assigneeId, dto.reviewerId);
    return this.assignments.assign({
      tenantId: ctx.tenantId, companyId: opp.companyId ?? null, opportunityId: id, actorId: ctx.actorId,
      assigneeId: dto.assigneeId, reviewerId: dto.reviewerId, inputRevision: dto.inputRevision, dueDate: dto.dueDate,
      deliverables: dto.deliverables, assigneeName, reviewerName,
    });
  }

  @Post('opportunities/:id/presales-assignment/reissue')
  @Permissions('crm.opportunity.deal-team')
  async reissue(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: ReissuePreSalesDto) {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new BadRequestException('an authenticated Sales user is required to reissue Pre-Sales work');
    const opp = await this.directOpportunity(id);
    const current = await this.assignments.forOpportunity(ctx.tenantId, id);
    if (!current) throw new NotFoundException('this opportunity has no Pre-Sales assignment to reissue');
    const [assigneeName, reviewerName] = await this.eligible(ctx.tenantId, opp.companyId ?? null, dto.assigneeId ?? current.assigneeId, dto.reviewerId ?? current.reviewerId);
    return this.assignments.reissue({
      tenantId: ctx.tenantId, opportunityId: id, actorId: ctx.actorId, reason: dto.reason, assigneeName, reviewerName,
      changes: {
        assigneeId: dto.assigneeId, reviewerId: dto.reviewerId, inputRevision: dto.inputRevision,
        dueDate: dto.dueDate, deliverables: dto.deliverables,
      },
    });
  }

  private async directOpportunity(id: string) {
    const opp = await this.opportunities.get(id);
    if (!opp || opp.tenantId !== this.tenant.get().tenantId) throw new NotFoundException(`opportunity ${id} not found`);
    if (opp.tenderId || opp.executionType === 'tender') {
      throw new BadRequestException('this is a tender-route deal — a Pre-Sales study assignment applies to the direct route only');
    }
    return opp;
  }

  /** Each person must be able to do their part, or the bound study could never complete. */
  private async eligible(tenantId: string, companyId: string | null, assigneeId: string, reviewerId: string): Promise<[string, string]> {
    await this.users.ensureTenant(tenantId);
    const assignee = this.users.get(tenantId, assigneeId);
    const reviewer = this.users.get(tenantId, reviewerId);
    if (!assignee?.active) throw new BadRequestException('Pre-Sales assignee must be an active workspace user');
    if (!reviewer?.active) throw new BadRequestException('technical reviewer must be an active workspace user');
    const orgPath = this.orgPath(tenantId, companyId);
    if (!this.access.can(assigneeId, { permission: 'crm.study.create', orgPath }).allowed) {
      throw new BadRequestException('the Pre-Sales assignee must hold crm.study.create to write the study');
    }
    if (!this.access.can(reviewerId, { permission: 'crm.study.approve', orgPath }).allowed) {
      throw new BadRequestException('the technical reviewer must hold crm.study.approve to review the study');
    }
    return [assignee.displayName, reviewer.displayName];
  }
}
