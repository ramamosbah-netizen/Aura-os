import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Headers, Inject, NotFoundException, Optional, Param, Patch, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe, Permissions } from '@aura/core';
import { parsePageParams, type ProjectHealth, type RiskImpact, type RiskLikelihood } from '@aura/shared';
import {
  type Project,
  type ProjectStatus,
  type TransitionGate,
  ProjectService,
  type WbsNode,
  type WbsNodeStatus,
  WbsService,
  type EvmMetrics,
  type CbsNode,
  type CbsCategory,
  type CbsSummary,
  CbsService,
  CostLedgerService,
  type QuantityPosition,
  QuantityLedgerService,
  type DelayEvent,
  type EotClaim,
  type DelayAnalysisSummary,
  DelayEotService,
  type VariationOrder,
  type VariationType,
  type VariationStatus,
  VariationService,
  type ProjectCloseout,
  CloseoutService,
  CloseoutReadinessService,
  type CloseoutReadiness,
  ProjectHealthService,
  type ProjectCashflowForecast,
  type CashflowSummary,
  type NewCashflowPeriod,
  CashflowForecastService,
  type ProjectSchedule,
  type ScheduleSummary,
  type NewScheduleTask,
  type PlanInput,
  type SchedulePlan,
  type PlanningRun,
  type PlanningRunView,
  ScheduleService,
  type DeliveryItemMap,
  DeliveryItemMapService,
  // §21 — three authorities: one per register, plus the command that spans them.
  type ProjectRisk,
  type ProjectRiskStatus,
  type ProjectRiskSummary,
  type ProjectIssue,
  type ProjectIssueReference,
  type ProjectIssueSeverity,
  type ProjectIssueStatus,
  type ProjectIssueSummary,
  type ProjectDeliveryArea,
  ProjectRiskService,
  ProjectIssueService,
  ProjectRiskMaterialisationService,
} from '@aura/projects';
import { AccountService } from '@aura/crm';
import { resolveAccountSnapshot } from '../common/account-snapshot';

class CreateProjectDto {
  @IsString() title!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() contractId?: string | null;
  @IsOptional() @IsString() contractTitle?: string | null;
  @IsOptional() @IsString() accountId?: string | null;
  @IsOptional() @IsString() accountName?: string | null;
  /**
   * Where a project may START. Not every state — reaching `active` or `completed` is a governed
   * transition with conditions, and creation must not be the way around them. `@IsString()` alone
   * would have accepted any text at all into a column with no CHECK constraint.
   */
  @IsOptional() @IsIn(['planned', 'planning']) status?: ProjectStatus;
  @IsOptional() @IsNumber() value?: number;
}

class UpdateProjectDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() reference?: string;
  /**
   * Declared ONLY so it can be refused out loud.
   *
   * Removing it was worse: the global pipe runs `whitelist: true`, so an unknown `status` is
   * stripped in silence and the request answers 200 — the caller is told their status change
   * succeeded, and the project never moved. A field that is ignored quietly is a worse lie than a
   * field that is rejected. The route below turns this into a 400 that names where the change
   * actually belongs.
   */
  @IsOptional() @IsString() status?: ProjectStatus;
  @IsOptional() @IsNumber() value?: number;
}

class CancelProjectDto {
  @IsString() reason!: string;
}

class CreateWbsNodeDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsNumber() plannedValue?: number;
  @IsOptional() @IsString() boqItemId?: string | null;
}

class CreateCbsNodeDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() category?: CbsCategory;
  @IsOptional() @IsNumber() budgetAmount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateDeliveryItemMapDto {
  @IsString() projectId!: string;
  @IsString() handoverId!: string;
  @IsString() frozenItemKey!: string;
  @IsString() sourceKind!: string;
  @IsOptional() @IsString() sourceId?: string | null;
  @IsOptional() @IsString() sourceRevisionRef?: string | null;
  @IsOptional() @IsString() sourceItemId?: string | null;
  @IsOptional() @IsString() wbsNodeId?: string | null;
  @IsOptional() @IsString() cbsNodeId?: string | null;
}

class CreateDelayDto {
  @IsString() projectId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() causeCategory?: string;
  @IsString() startDate!: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsNumber() delayDays?: number;
  @IsOptional() @IsBoolean() isConcurrent?: boolean;
  @IsOptional() @IsString() linkedActivityCode?: string;
  @IsOptional() @IsString() description?: string;
}

class CreateEotDto {
  @IsString() projectId!: string;
  @IsString() title!: string;
  @IsNumber() submittedDays!: number;
  @IsOptional() @IsString() justification?: string;
  @IsOptional() @IsString() originalCompletionDate?: string;
  @IsOptional() @IsArray() delayEventIds?: string[];
}

// ── §21 Risks & Issues ─────────────────────────────────────────────────────
//
// Two registers, two sets of DTOs. They are never one endpoint with a `kind` parameter, for the
// same reason they are never one table: a risk is uncertain and forward-looking, an issue has
// already happened, and each has a lifecycle the other cannot express.

class IssueReferenceDto {
  @IsString() module!: string;
  @IsString() recordType!: string;
  @IsString() recordId!: string;
  @IsOptional() @IsString() label?: string;
}

const AREAS = [
  'DESIGN', 'PROCUREMENT', 'SCHEDULE', 'COST', 'QUALITY', 'SAFETY',
  'RESOURCE', 'CLIENT', 'AUTHORITY', 'SUBCONTRACTOR', 'INTERFACE', 'OTHER',
] as const;

class CreateRiskDto {
  @IsString() projectId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(AREAS) area?: ProjectDeliveryArea;
  @IsOptional() @IsIn(['low', 'medium', 'high']) likelihood?: RiskLikelihood;
  @IsOptional() @IsIn(['low', 'medium', 'high']) impact?: RiskImpact;
  @IsOptional() @IsString() mitigation?: string;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() targetDate?: string;
}

class UpdateRiskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(AREAS) area?: ProjectDeliveryArea;
  @IsOptional() @IsIn(['low', 'medium', 'high']) likelihood?: RiskLikelihood;
  @IsOptional() @IsIn(['low', 'medium', 'high']) impact?: RiskImpact;
  @IsOptional() @IsString() mitigation?: string;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() targetDate?: string;
}

class RiskStatusDto {
  /**
   * MATERIALISED is absent on purpose, and the domain refuses it a second time.
   *
   * A risk is marked as having occurred only by materialising it into an issue, in one
   * transaction. Accepting it here would be a second writer for that state, and could leave a risk
   * reading as landed with no live problem to point at.
   */
  @IsIn(['OPEN', 'MITIGATING', 'ACCEPTED', 'RESOLVED']) status!: ProjectRiskStatus;
  /** Required by the domain for ACCEPTED — an acceptance nobody justified is not governance. */
  @IsOptional() @IsString() note?: string;
}

class MaterialiseRiskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['minor', 'major', 'critical']) severity?: ProjectIssueSeverity;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() raisedAt?: string;
  @IsOptional() @IsArray() references?: IssueReferenceDto[];
}

class CreateIssueDto {
  @IsString() projectId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(AREAS) area?: ProjectDeliveryArea;
  @IsOptional() @IsIn(['minor', 'major', 'critical']) severity?: ProjectIssueSeverity;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() raisedAt?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsArray() references?: IssueReferenceDto[];
}

class UpdateIssueDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(AREAS) area?: ProjectDeliveryArea;
  @IsOptional() @IsIn(['minor', 'major', 'critical']) severity?: ProjectIssueSeverity;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() raisedAt?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsArray() references?: IssueReferenceDto[];
}

class IssueStatusDto {
  @IsIn(['open', 'in_progress', 'resolved', 'withdrawn']) status!: ProjectIssueStatus;
  /** Required by the domain to reach either ending. */
  @IsOptional() @IsString() note?: string;
}

/** Projects API — stamps tenant/actor from context, delegates to Services. */
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectService,
    private readonly wbs: WbsService,
    private readonly cbs: CbsService,
    private readonly ledger: CostLedgerService,
    private readonly quantityLedger: QuantityLedgerService,
    private readonly delayEot: DelayEotService,
    private readonly variations: VariationService,
    // Three, not one. Neither register service can write the other's table, and only the
    // materialisation command holds both — see DG-21.4. The controller is allowed to READ from
    // both to compose the Project 360 register view; that creates no new business authority.
    private readonly risks: ProjectRiskService,
    private readonly issues: ProjectIssueService,
    private readonly riskMaterialisation: ProjectRiskMaterialisationService,
    private readonly closeouts: CloseoutService,
    // @Inject explicitly, for the reason CloseoutService already documents: a union-typed ctor
    // param emits `Object` for design:paramtypes, so Nest resolves nothing and injects null in
    // silence. The endpoint then answers 503 "not configured" on a deployment that IS configured —
    // which is exactly what it did until this line named the token.
    @Optional() @Inject(CloseoutReadinessService) private readonly closeoutReadiness: CloseoutReadinessService | null = null,
    private readonly health: ProjectHealthService,
    private readonly cashflow: CashflowForecastService,
    private readonly schedule: ScheduleService,
    private readonly deliveryItemMaps: DeliveryItemMapService,
    private readonly accounts: AccountService,
    private readonly tenant: TenantContext,
  ) {}

  // ── PROJECTS ─────────────────────────────────────────────────────────────

  @Post('projects')
  async createProject(@Body() dto: CreateProjectDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Project> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.projects.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      contractId: dto.contractId ?? null,
      contractTitle: dto.contractTitle ?? null,
      accountId: dto.accountId ?? null,
      accountName: await resolveAccountSnapshot(this.accounts, dto.accountId, dto.accountName),
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    }, idempotencyKey);
  }

  @Get('projects')
  listProjects(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('contractId') contractId?: string,
  ): Promise<Project[]> {
    return this.projects.list({ status, accountId, contractId, limit: 100 });
  }

  /**
   * GET /api/projects/portfolio — the PM/Delivery cockpit rollup: every project with its
   * live Earned-Value metrics (SPI/CPI/variances) composed in one call, so the front end
   * doesn't fan out an EVM request per project. At-risk = SPI or CPI below 1.
   */
  @Get('projects/portfolio')
  async portfolio(@Query('status') status?: string): Promise<Array<Project & { evm: EvmMetrics; atRisk: boolean }>> {
    const projects = await this.projects.list({ status, limit: 500 });
    return Promise.all(
      projects.map(async (p) => {
        const evm = await this.wbs.getEvmMetrics(p.id);
        const atRisk = p.status === 'active'
          && ((evm.spi !== null && evm.spi < 1) || (evm.cpi !== null && evm.cpi < 1));
        return { ...p, evm, atRisk };
      }),
    );
  }

  @Get('projects/paged')
  pagedProjects(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('contractId') contractId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.projects.listPaged(
      { tenantId: this.tenant.get().tenantId, status, accountId, contractId },
      parsePageParams(limit, offset),
    );
  }

  /** PATCH /api/projects/projects/:id — update mutable fields (title, reference, status, value). */
  @Patch('projects/:id')
  async updateProject(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateProjectDto): Promise<Project> {
    if (dto?.status !== undefined) {
      throw new BadRequestException(
        'project status is not an editable field: use PATCH /status for a transition, or PATCH /cancel to abandon the project',
      );
    }
    try {
      return await this.projects.update(id, {
        title: dto.title,
        reference: dto.reference,
        value: dto.value,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  /**
   * Execution lifecycle. Every transition EXCEPT cancellation, which has its own route below
   * because it has its own evidence: this one has no actor and no reason to give.
   */
  @Patch('projects/:id/status')
  async changeProjectStatus(@Param('id') id: string, @Body() dto: { status: ProjectStatus }): Promise<Project> {
    if (!dto?.status) throw new BadRequestException('status is required');
    try {
      return await this.projects.changeStatus(id, dto.status);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'transition failed');
    }
  }

  /** Every move available from here, each with its verdict — so a caller never offers a dead button. */
  @Get('projects/:id/transitions')
  async getProjectTransitions(@Param('id') id: string): Promise<TransitionGate[]> {
    try {
      return await this.projects.transitionsFor(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unavailable';
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  /**
   * Abandon a project. Separate from the status route on purpose: cancellation is the one
   * transition no facts can block, so what makes it governed is the record it leaves — the actor
   * comes from the authenticated context, and the reason has to be typed by a person.
   */
  @Patch('projects/:id/cancel')
  async cancelProject(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: CancelProjectDto): Promise<Project> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new BadRequestException('actor is required to cancel a project');
    if (!dto?.reason?.trim()) throw new BadRequestException('a reason is required to cancel a project');
    try {
      return await this.projects.cancel({ projectId: id, actorId: ctx.actorId, reason: dto.reason });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'cancellation failed';
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  @Get('projects/:id')
  async getProject(@Param('id') id: string): Promise<Project> {
    const found = await this.projects.get(id);
    if (!found) throw new NotFoundException(`project ${id} not found`);
    return found;
  }

  @Get('projects/:id/evm')
  async getProjectEvm(@Param('id') id: string): Promise<EvmMetrics> {
    const found = await this.projects.get(id);
    if (!found) throw new NotFoundException(`project ${id} not found`);
    return this.wbs.getEvmMetrics(id);
  }

  // ── DELIVERY ITEM MAPPING (explicit post-handover governed step) ─────────

  @Post('delivery-item-maps')
  async createDeliveryItemMap(@Body() dto: CreateDeliveryItemMapDto): Promise<DeliveryItemMap> {
    if (!dto?.projectId || !dto?.handoverId) throw new BadRequestException('projectId and handoverId are required');
    if (!dto?.frozenItemKey?.trim()) throw new BadRequestException('frozenItemKey is required');
    const ctx = this.tenant.get();
    try {
      return await this.deliveryItemMaps.create({
        tenantId: ctx.tenantId,
        projectId: dto.projectId,
        handoverId: dto.handoverId,
        frozenItemKey: dto.frozenItemKey,
        sourceKind: dto.sourceKind as 'DIRECT' | 'TENDER',
        sourceId: dto.sourceId ?? null,
        sourceRevisionRef: dto.sourceRevisionRef ?? null,
        sourceItemId: dto.sourceItemId ?? null,
        wbsNodeId: dto.wbsNodeId ?? null,
        cbsNodeId: dto.cbsNodeId ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delivery item mapping failed';
      if (message.includes('conflicting immutable')) throw new ConflictException(message);
      if (message.includes('not found')) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
  }

  @Get('delivery-item-maps')
  listDeliveryItemMaps(@Query('projectId') projectId?: string, @Query('handoverId') handoverId?: string, @Query('frozenItemKey') frozenItemKey?: string): Promise<DeliveryItemMap[]> {
    return this.deliveryItemMaps.list({ projectId, handoverId, frozenItemKey });
  }

  @Get('delivery-item-maps/:id')
  async getDeliveryItemMap(@Param('id', ParseUuidOr404Pipe) id: string): Promise<DeliveryItemMap> {
    const found = await this.deliveryItemMaps.get(id);
    if (!found) throw new NotFoundException(`delivery item mapping ${id} not found`);
    return found;
  }

  // ── WBS (WORK BREAKDOWN STRUCTURE) ───────────────────────────────────────

  @Post('wbs')
  createWbsNode(@Body() dto: CreateWbsNodeDto): Promise<WbsNode> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');

    const ctx = this.tenant.get();
    return this.wbs.create({
      tenantId: ctx.tenantId,
      projectId: dto.projectId,
      parentId: dto.parentId ?? null,
      code: dto.code,
      title: dto.title,
      plannedValue: dto.plannedValue,
      boqItemId: dto.boqItemId ?? null,
      createdBy: ctx.actorId,
    });
  }

  /** Approve the exact opening WBS BAC allocation set; later baseline-participating writes are rejected. */
  @Post('projects/:id/wbs-baseline')
  async approveWbsBaseline(@Param('id') id: string): Promise<unknown> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new BadRequestException('actor is required to approve a WBS baseline');
    try {
      return await this.wbs.approveOpeningBaseline(id, ctx.actorId);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'WBS baseline approval failed');
    }
  }

  @Get('wbs')
  listWbsNodes(
    @Query('projectId') projectId?: string,
    @Query('parentId') parentId?: string,
  ): Promise<WbsNode[]> {
    const ctx = this.tenant.get();
    const parentVal = parentId === 'null' ? null : parentId;
    return this.wbs.list({
      tenantId: ctx.tenantId,
      projectId,
      parentId: parentVal,
    });
  }

  @Get('wbs/:id')
  async getWbsNode(@Param('id') id: string): Promise<WbsNode> {
    const found = await this.wbs.get(id);
    if (!found) throw new NotFoundException(`WBS node ${id} not found`);
    return found;
  }

  @Patch('wbs/:id/progress')
  async updateWbsProgress(
    @Param('id') id: string,
    @Body() dto: { progress: number; status?: WbsNodeStatus },
  ): Promise<WbsNode> {
    if (dto?.progress === undefined) throw new BadRequestException('progress is required');
    if (typeof dto.progress !== 'number' || !Number.isFinite(dto.progress)) {
      throw new BadRequestException('progress must be a finite number');
    }
    const ctx = this.tenant.get();
    try {
      return await this.wbs.updateProgress(id, dto.progress, dto.status, ctx.actorId ?? undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WBS progress update failed';
      // A mapped/derived node is a governed conflict, not an infrastructure failure. Keep the
      // domain guard authoritative while exposing a stable HTTP boundary to delivery operators.
      if (message.includes('manual progress is not allowed')) throw new ConflictException(message);
      if (message.includes('not found')) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
  }

  // ── CBS (COST BREAKDOWN STRUCTURE) ───────────────────────────────────────

  @Post('cbs')
  async createCbsNode(@Body() dto: CreateCbsNodeDto): Promise<CbsNode> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    try {
      return await this.cbs.create({
        tenantId: ctx.tenantId,
        projectId: dto.projectId,
        parentId: dto.parentId ?? null,
        code: dto.code,
        title: dto.title,
        category: dto.category,
        budgetAmount: dto.budgetAmount,
        currency: dto.currency,
        notes: dto.notes,
        createdBy: ctx.actorId,
      });
    } catch (error) {
      throw this.mapCbsError(error);
    }
  }

  @Get('cbs')
  listCbsNodes(@Query('projectId') projectId?: string): Promise<CbsNode[]> {
    return this.cbs.list(projectId ? { projectId } : undefined);
  }

  @Get('cbs/summary/:projectId')
  getCbsSummary(@Param('projectId') projectId: string): Promise<CbsSummary> {
    return this.cbs.getSummary(projectId);
  }

  /**
   * The cost ledger — every transaction behind the numbers, like a bank statement. Filter by
   * `cbsNodeId` to drill into a single cost line ("show transactions"), or by `projectId` for the
   * whole project. This is what makes the CBS balance auditable: it is SUM(this).
   */
  @Get('cost-ledger')
  costLedger(@Query('projectId') projectId?: string, @Query('cbsNodeId') cbsNodeId?: string, @Query('limit') limit?: string) {
    return this.ledger.list({ tenantId: this.tenant.get().tenantId, projectId, cbsNodeId, limit: limit ? Number(limit) : undefined });
  }

  /**
   * The quantity ledger — the physical twin of the cost ledger. Every quantity movement behind a BOQ
   * item's numbers. Filter by `boqItemId` to drill into one measured line ("show transactions"), or by
   * `projectId` for the whole project. A BOQ item's position IS SUM(this).
   */
  @Get('quantity-ledger')
  quantityLedgerList(@Query('projectId') projectId?: string, @Query('boqItemId') boqItemId?: string, @Query('limit') limit?: string) {
    return this.quantityLedger.list({ tenantId: this.tenant.get().tenantId, projectId, boqItemId, limit: limit ? Number(limit) : undefined });
  }

  /** A BOQ item's live position: BOQ target → ordered → received → issued → installed → approved →
   *  invoiced, plus the derived gaps (remaining-to-order, in-transit, on-site, wastage, …). */
  @Get('quantity-ledger/position/:boqItemId')
  quantityPosition(@Param('boqItemId') boqItemId: string): Promise<QuantityPosition> {
    return this.quantityLedger.position(this.tenant.get().tenantId, boqItemId);
  }

  /** Set/adjust a BOQ item's target quantity — the baseline its position is measured against. */
  @Post('quantity-ledger/baseline')
  setQuantityBaseline(
    @Body() dto: { projectId: string; boqItemId: string; quantity: number; unit?: string; cbsNodeId?: string | null },
  ) {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.boqItemId) throw new BadRequestException('boqItemId is required');
    if (!(Number(dto.quantity) >= 0)) throw new BadRequestException('quantity must be a non-negative number');
    const ctx = this.tenant.get();
    return this.quantityLedger.setBaseline({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      boqItemId: dto.boqItemId,
      quantity: Number(dto.quantity),
      unit: dto.unit ?? null,
      cbsNodeId: dto.cbsNodeId ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Patch('cbs/:id')
  async updateCbsNode(
    @Param('id') id: string,
    @Body() dto: Partial<Pick<CbsNode, 'title' | 'category' | 'budgetAmount' | 'committedAmount' | 'actualAmount' | 'forecastAmount' | 'notes'>>,
  ): Promise<CbsNode> {
    try {
      return await this.cbs.update(id, dto);
    } catch (error) {
      throw this.mapCbsError(error);
    }
  }

  @Delete('cbs/:id')
  async deleteCbsNode(@Param('id') id: string): Promise<{ deleted: true }> {
    try {
      await this.cbs.delete(id);
      return { deleted: true };
    } catch (error) {
      throw this.mapCbsError(error);
    }
  }

  private mapCbsError(error: unknown): Error {
    const message = error instanceof Error ? error.message : 'CBS operation failed';
    if (message.includes('Cost Ledger-owned')) return new ConflictException(message);
    if (message.includes('immutable after handover')) return new ConflictException(message);
    if (message.includes('not found')) return new NotFoundException(message);
    return new BadRequestException(message);
  }

  // ── DELAY ANALYSIS ───────────────────────────────────────────────────────

  @Post('delays')
  createDelay(@Body() dto: CreateDelayDto): Promise<DelayEvent> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.startDate) throw new BadRequestException('startDate is required');
    const ctx = this.tenant.get();
    return this.delayEot.createDelay({
      tenantId: ctx.tenantId,
      projectId: dto.projectId,
      title: dto.title,
      causeCategory: dto.causeCategory as any,
      startDate: dto.startDate,
      endDate: dto.endDate,
      delayDays: dto.delayDays,
      isConcurrent: dto.isConcurrent,
      linkedActivityCode: dto.linkedActivityCode,
      description: dto.description,
      actorId: ctx.actorId,
    });
  }

  @Get('delays')
  listDelays(
    @Query('projectId') projectId?: string,
    @Query('causeCategory') causeCategory?: string,
  ): Promise<DelayEvent[]> {
    return this.delayEot.listDelays({ projectId, causeCategory });
  }

  @Patch('delays/:id/status')
  async updateDelayStatus(
    @Param('id') id: string,
    @Body() dto: { status: string },
  ): Promise<DelayEvent> {
    if (!dto?.status) throw new BadRequestException('status is required');
    return this.delayEot.updateDelayStatus(id, dto.status as any);
  }

  @Get('delays/analysis/:projectId')
  getDelayAnalysis(@Param('projectId') projectId: string): Promise<DelayAnalysisSummary> {
    return this.delayEot.getDelayAnalysis(projectId);
  }

  // ── EOT CLAIMS (EXTENSION OF TIME) ───────────────────────────────────────

  @Post('eot-claims')
  createEotClaim(@Body() dto: CreateEotDto): Promise<EotClaim> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.submittedDays) throw new BadRequestException('submittedDays is required');
    const ctx = this.tenant.get();
    return this.delayEot.createEotClaim({
      tenantId: ctx.tenantId,
      projectId: dto.projectId,
      claimNumber: Date.now() % 10000, // auto-assign; in production would use numbering service
      title: dto.title,
      submittedDays: dto.submittedDays,
      justification: dto.justification,
      originalCompletionDate: dto.originalCompletionDate,
      delayEventIds: dto.delayEventIds,
      actorId: ctx.actorId,
    });
  }

  @Get('eot-claims')
  listEotClaims(@Query('projectId') projectId?: string): Promise<EotClaim[]> {
    return this.delayEot.listEotClaims(projectId ? { projectId } : undefined);
  }

  @Post('eot-claims/:id/submit')
  submitEotClaim(@Param('id') id: string): Promise<EotClaim> {
    return this.delayEot.submitEotClaim(id, this.tenant.get().actorId);
  }

  // ── §21 RISKS ────────────────────────────────────────────────────────────

  @Post('risks')
  raiseRisk(@Body() dto: CreateRiskDto): Promise<ProjectRisk> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.risks.raise({
      tenantId: ctx.tenantId,
      projectId: dto.projectId,
      title: dto.title,
      reference: dto.reference,
      description: dto.description,
      area: dto.area,
      likelihood: dto.likelihood,
      impact: dto.impact,
      mitigation: dto.mitigation,
      owner: dto.owner,
      ownerId: dto.ownerId,
      targetDate: dto.targetDate,
      actorId: ctx.actorId,
    });
  }

  @Get('risks')
  listRisks(
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('area') area?: string,
    @Query('openOnly') openOnly?: string,
  ): Promise<ProjectRisk[]> {
    return this.risks.list({ projectId, status, area, openOnly: openOnly === 'true' });
  }

  @Get('risks/:id')
  async getRisk(@Param('id', ParseUuidOr404Pipe) id: string): Promise<ProjectRisk> {
    const found = await this.risks.get(id);
    if (!found) throw new NotFoundException(`risk ${id} not found`);
    return found;
  }

  @Patch('risks/:id')
  updateRisk(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateRiskDto): Promise<ProjectRisk> {
    return this.risks.update(id, dto, this.tenant.get().actorId);
  }

  /**
   * Declared explicitly rather than derived.
   *
   * `derivePermissionFromRoute` would read the trailing verb and require `projects.risk.status`,
   * while the service asserts `projects.risk.update` — two different permissions guarding one
   * operation. A tenant holding `projects.*` never notices; a role scoped precisely to
   * `projects.risk.update` would pass the service check and be refused at the door.
   */
  @Permissions('projects.risk.update')
  @Patch('risks/:id/status')
  setRiskStatus(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: RiskStatusDto): Promise<ProjectRisk> {
    if (!dto?.status) throw new BadRequestException('status is required');
    return this.risks.setStatus(id, dto.status, { note: dto.note, actorId: this.tenant.get().actorId });
  }

  /**
   * The risk OCCURRED. Creates an ISSUE and retires the risk as MATERIALISED, in one transaction.
   *
   * A POST rather than a PATCH on status, because the meaningful outcome is a new record — and
   * because `PATCH /risks/:id/status` deliberately cannot reach MATERIALISED at all. Returns both
   * so the caller can navigate straight to the live problem without a second read.
   *
   * `projectId` is taken from the URL and checked against the risk rather than trusted. A request
   * naming project B while addressing a risk in project A is refused instead of quietly succeeding
   * and producing an issue on A.
   */
  /**
   * Both permissions, declared where the guard can see them.
   *
   * Derivation would have required `projects.project.materialise` — the wrong entity entirely,
   * because the route is nested under `projects/:projectId`. Materialising is not an operation on
   * a project; it retires a risk AND creates an issue, which is why the service demands both, and
   * why holding one of the two must not open this door.
   */
  @Permissions('projects.risk.update', 'projects.issue.create')
  @Post('projects/:projectId/risks/:id/materialise')
  materialiseRisk(
    @Param('projectId', ParseUuidOr404Pipe) projectId: string,
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: MaterialiseRiskDto,
  ): Promise<{ risk: ProjectRisk; issue: ProjectIssue }> {
    return this.riskMaterialisation.materialise(id, {
      ...dto,
      expectedProjectId: projectId,
      references: dto?.references as ProjectIssueReference[] | undefined,
      actorId: this.tenant.get().actorId,
    });
  }

  // ── §21 ISSUES ───────────────────────────────────────────────────────────

  @Post('issues')
  raiseIssue(@Body() dto: CreateIssueDto): Promise<ProjectIssue> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.issues.raise({
      tenantId: ctx.tenantId,
      projectId: dto.projectId,
      title: dto.title,
      reference: dto.reference,
      description: dto.description,
      area: dto.area,
      severity: dto.severity,
      owner: dto.owner,
      ownerId: dto.ownerId,
      raisedAt: dto.raisedAt,
      dueDate: dto.dueDate,
      references: dto.references as ProjectIssueReference[] | undefined,
      actorId: ctx.actorId,
    });
  }

  @Get('issues')
  listIssues(
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('area') area?: string,
    @Query('severity') severity?: string,
    @Query('openOnly') openOnly?: string,
    @Query('fromRiskOnly') fromRiskOnly?: string,
  ): Promise<ProjectIssue[]> {
    return this.issues.list({
      projectId, status, area, severity,
      openOnly: openOnly === 'true',
      fromRiskOnly: fromRiskOnly === 'true',
    });
  }

  @Get('issues/:id')
  async getIssue(@Param('id', ParseUuidOr404Pipe) id: string): Promise<ProjectIssue> {
    const found = await this.issues.get(id);
    if (!found) throw new NotFoundException(`issue ${id} not found`);
    return found;
  }

  @Patch('issues/:id')
  updateIssue(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateIssueDto): Promise<ProjectIssue> {
    return this.issues.update(id, {
      ...dto,
      references: dto.references as ProjectIssueReference[] | undefined,
    }, this.tenant.get().actorId);
  }

  /** Explicit for the same reason as the risk status route above. */
  @Permissions('projects.issue.update')
  @Patch('issues/:id/status')
  setIssueStatus(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: IssueStatusDto): Promise<ProjectIssue> {
    if (!dto?.status) throw new BadRequestException('status is required');
    return this.issues.setStatus(id, dto.status, { note: dto.note, actorId: this.tenant.get().actorId });
  }

  /**
   * Both registers for one project, with their rollups.
   *
   * Composed HERE rather than in a fourth service, because concatenating two reads creates no new
   * business authority (DG-21.4). What it does create is one `asOf` date for both halves — so
   * "overdue" cannot mean two different days on the two sides of the same screen. Stamped at the
   * boundary, because the domain rules stay clock-free.
   */
  @Get('projects/:id/risk-register')
  async riskRegister(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{
    risks: ProjectRisk[];
    issues: ProjectIssue[];
    riskSummary: ProjectRiskSummary;
    issueSummary: ProjectIssueSummary;
    asOf: string;
  }> {
    const found = await this.projects.get(id);
    if (!found) throw new NotFoundException(`project ${id} not found`);
    const asOf = new Date().toISOString().slice(0, 10);
    const [risks, issues, riskSummary, issueSummary] = await Promise.all([
      this.risks.list({ projectId: id }),
      this.issues.list({ projectId: id }),
      this.risks.summaryFor(id, asOf),
      this.issues.summaryFor(id, asOf),
    ]);
    return { risks, issues, riskSummary, issueSummary, asOf };
  }

  // ── VARIATION ORDERS (change orders) ─────────────────────────────────────

  @Post('variations')
  createVariation(@Body() dto: { projectId: string; projectTitle?: string; cbsNodeId?: string | null; title: string; description?: string; type: VariationType; amount: number; reference?: string }): Promise<VariationOrder> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (dto?.type !== 'addition' && dto?.type !== 'omission') throw new BadRequestException("type must be 'addition' or 'omission'");
    if (!(Number(dto.amount) > 0)) throw new BadRequestException('amount must be positive');
    const ctx = this.tenant.get();
    return this.variations.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectTitle: dto.projectTitle ?? null,
      cbsNodeId: dto.cbsNodeId ?? null,
      title: dto.title,
      description: dto.description ?? null,
      type: dto.type,
      amount: dto.amount,
      reference: dto.reference ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Get('variations')
  listVariations(@Query('projectId') projectId?: string, @Query('status') status?: string): Promise<VariationOrder[]> {
    const ctx = this.tenant.get();
    return this.variations.list({ tenantId: ctx.tenantId, projectId, status, limit: 200 });
  }

  @Get('variations/summary/:projectId')
  variationSummary(@Param('projectId') projectId: string) {
    const ctx = this.tenant.get();
    return this.variations.getProjectSummary(ctx.tenantId, projectId);
  }

  @Get('variations/paged')
  pagedVariations(
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.variations.listPaged(
      { tenantId: this.tenant.get().tenantId, projectId, status },
      parsePageParams(limit, offset),
    );
  }

  @Patch('variations/:id/status')
  async changeVariationStatus(@Param('id') id: string, @Body() dto: { status: VariationStatus }): Promise<VariationOrder> {
    const valid: VariationStatus[] = ['draft', 'submitted', 'approved', 'rejected'];
    if (!dto?.status || !valid.includes(dto.status)) throw new BadRequestException('valid status is required');
    const found = await this.variations.get(id);
    if (!found) throw new NotFoundException(`variation ${id} not found`);
    const ctx = this.tenant.get();
    return this.variations.changeStatus(id, dto.status, ctx.actorId ?? undefined);
  }

  @Post('eot-claims/:id/decide')
  decideEotClaim(
    @Param('id') id: string,
    @Body() dto: { status: string; approvedDays: number; revisedCompletionDate?: string },
  ): Promise<EotClaim> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const ctx = this.tenant.get();
    return this.delayEot.decideEotClaim(id, {
      status: dto.status as any,
      approvedDays: dto.approvedDays ?? 0,
      decidedBy: ctx.actorId ?? 'system',
      revisedCompletionDate: dto.revisedCompletionDate,
    });
  }

  // ── Closeout ───────────────────────────────────────────────────────────────

  @Post('closeouts')
  async startCloseout(@Body() dto: { projectId: string; projectName?: string; items?: string[]; notes?: string }): Promise<ProjectCloseout> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    const ctx = this.tenant.get();
    return await this.closeouts.start({ tenantId: ctx.tenantId, companyId: ctx.companyId, projectId: dto.projectId, projectName: dto.projectName, items: dto.items, notes: dto.notes, createdBy: ctx.actorId });
  }

  @Get('closeouts')
  listCloseouts(@Query('projectId') projectId?: string, @Query('status') status?: string): Promise<ProjectCloseout[]> {
    const ctx = this.tenant.get();
    return this.closeouts.list({ tenantId: ctx.tenantId, projectId, status, limit: 200 });
  }

  /**
   * The closeout verdict for one project, with a reason for every domain.
   *
   * A READ of the same assessment `finalize` enforces — deliberately the same service, so the page
   * can never show a verdict the write would disagree with. That symmetry is the point: a preview
   * that is computed differently from the enforcement is how "it said I could close it" happens.
   */
  @Get('projects/:id/closeout-readiness')
  async closeoutReadinessFor(@Param('id') id: string): Promise<CloseoutReadiness> {
    const ctx = this.tenant.get();
    if (!this.closeoutReadiness) {
      throw new ServiceUnavailableException('closeout readiness is not configured in this deployment');
    }
    return this.closeoutReadiness.assess(ctx.tenantId, id);
  }

  /**
   * GET /projects/:id/health — the cross-domain read (§24).
   *
   * One canonical assessment: overall severity, coverage, and a per-signal breakdown carrying the
   * owning domain, its own reason and where to go next. No mutation endpoint exists or should:
   * §2 authorises transitions, §27 authorises closeout, and this authorises nothing.
   *
   * Unlike the closeout endpoint above, an unconfigured provider is NOT a 503. A domain that
   * cannot answer is a normal, reportable state here — it becomes UNKNOWN and degrades coverage —
   * and refusing the whole read because one of nine is unavailable would hide the eight that
   * answered.
   */
  @Get('projects/:id/health')
  async projectHealth(@Param('id', ParseUuidOr404Pipe) id: string): Promise<ProjectHealth & { assessedAt: string }> {
    const ctx = this.tenant.get();
    const found = await this.projects.get(id);
    if (!found) throw new NotFoundException(`project ${id} not found`);
    // Stamped here rather than in the rules, which stay pure and clock-free.
    return { ...(await this.health.assess(ctx.tenantId, id)), assessedAt: new Date().toISOString() };
  }

  @Get('closeouts/paged')
  pagedCloseouts(
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.closeouts.listPaged(
      { tenantId: this.tenant.get().tenantId, projectId, status },
      parsePageParams(limit, offset),
    );
  }

  @Patch('closeouts/:id/items/:index')
  async setCloseoutItem(@Param('id') id: string, @Param('index') index: string, @Body() dto: { done: boolean }): Promise<ProjectCloseout> {
    return await this.closeouts.setItem(this.tenant.get().tenantId, id, Number(index), dto?.done ?? false);
  }

  @Post('closeouts/:id/finalize')
  async finalizeCloseout(@Param('id') id: string, @Body() dto: { handoverDate: string; dlpMonths?: number }): Promise<ProjectCloseout> {
    if (!dto?.handoverDate) throw new BadRequestException('handoverDate is required');
    try {
      return await this.closeouts.finalize(this.tenant.get().tenantId, id, dto.handoverDate, dto.dlpMonths);
    } catch (error) {
      // A governed refusal is a CONFLICT with the project's current state, not a server fault. The
      // distinction is load-bearing for the caller: a 500 says "try again / raise a ticket", while
      // a 409 carrying the blockers says "this is the work, go and do it". Answering 500 would also
      // hide a real fault among ordinary refusals in every dashboard that counts them.
      const message = error instanceof Error ? error.message : String(error);
      if (/not ready|checklist items are not done|already completed/.test(message)) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  // ── Cash-flow forecast ───────────────────────────────────────────────────────

  @Post('cashflow-forecasts')
  async saveCashflow(@Body() dto: { projectId: string; projectName?: string; periods?: NewCashflowPeriod[]; notes?: string }): Promise<ProjectCashflowForecast> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    const ctx = this.tenant.get();
    return await this.cashflow.save({ tenantId: ctx.tenantId, companyId: ctx.companyId, projectId: dto.projectId, projectName: dto.projectName, periods: dto.periods, notes: dto.notes, createdBy: ctx.actorId });
  }

  @Get('cashflow-forecasts')
  listCashflow(): Promise<ProjectCashflowForecast[]> {
    return this.cashflow.list(this.tenant.get().tenantId);
  }

  @Get('cashflow-forecasts/summary/:projectId')
  async cashflowSummary(@Param('projectId') projectId: string): Promise<CashflowSummary> {
    const s = await this.cashflow.summary(this.tenant.get().tenantId, projectId);
    if (!s) throw new NotFoundException(`no cash-flow forecast for project ${projectId}`);
    return s;
  }

  // ── Schedule (Gantt + baseline) ──────────────────────────────────────────────

  @Post('schedules')
  async saveSchedule(@Body() dto: { projectId: string; projectName?: string; tasks?: NewScheduleTask[] }): Promise<ProjectSchedule> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    const ctx = this.tenant.get();
    return await this.schedule.save({ tenantId: ctx.tenantId, companyId: ctx.companyId, projectId: dto.projectId, projectName: dto.projectName, tasks: dto.tasks, createdBy: ctx.actorId });
  }

  @Get('schedules')
  listSchedules(): Promise<ProjectSchedule[]> {
    return this.schedule.list(this.tenant.get().tenantId);
  }

  // Reactive planning: CPM forward-pass reschedule + resource levelling (stateless compute).
  /**
   * Compute a levelled plan from RESOLVED facts. Returns a proposal; stores nothing.
   *
   * A capacity omitted here comes back as UNKNOWN feasibility, never as available — which is the
   * §22 correction. Cross-project commitments are supplied by the caller until the Capacity
   * Resolver exists; without them this answers about one project only, and says so by reporting
   * only what it was given.
   */
  @Post('schedules/plan')
  planSchedule(@Body() dto: PlanInput): SchedulePlan {
    if (!dto?.projectStart) throw new BadRequestException('projectStart (YYYY-MM-DD) is required');
    if (!Array.isArray(dto?.tasks) || dto.tasks.length === 0) throw new BadRequestException('at least one task is required');
    return this.schedule.plan(dto);
  }

  @Post('schedules/:projectId/baseline')
  async setBaseline(@Param('projectId') projectId: string): Promise<ProjectSchedule> {
    return await this.schedule.setBaseline(this.tenant.get().tenantId, projectId);
  }

  @Get('schedules/summary/:projectId')
  async scheduleSummary(@Param('projectId') projectId: string): Promise<ScheduleSummary> {
    const s = await this.schedule.summary(this.tenant.get().tenantId, projectId);
    if (!s) throw new NotFoundException(`no schedule for project ${projectId}`);
    return s;
  }

  // ── §22 — planning runs and governed acceptance ─────────────────────────────
  //
  // Unlike `schedules/plan` (a stateless compute over caller-supplied facts), these RESOLVE the facts
  // from the cross-project capacity engine and PERSIST the result as a proposal. Acceptance is a
  // separate, governed act that promotes a proposal to the current plan (DG-22.4); a run never does.

  /** Run the solver against resolved facts and persist a proposal. Returns it and what it would change. */
  @Permissions('projects.schedule.plan')
  @Post('schedules/:projectId/planning-runs')
  async runPlanning(@Param('projectId') projectId: string): Promise<PlanningRunView> {
    const ctx = this.tenant.get();
    return await this.schedule.runPlanning(ctx.tenantId, projectId, { ranBy: ctx.actorId });
  }

  /** A schedule's runs, newest first. */
  @Permissions('projects.schedule.read')
  @Get('schedules/:projectId/planning-runs')
  listPlanningRuns(@Param('projectId') projectId: string): Promise<PlanningRun[]> {
    return this.schedule.listRuns(this.tenant.get().tenantId, projectId);
  }

  /** One run and the change accepting it would make to the current plan. */
  @Permissions('projects.schedule.read')
  @Get('planning-runs/:runId')
  getPlanningRun(@Param('runId') runId: string): Promise<PlanningRunView> {
    return this.schedule.getRun(this.tenant.get().tenantId, runId);
  }

  /**
   * Promote a proposal to the current plan. A NOT-established proposal (a known conflict, or
   * something unjudged) requires `acknowledgeReason` — the same governance a booking's over-capacity
   * commitment carries. The domain refuses it otherwise, surfacing a 400 through the taxonomy.
   *
   * A DISTINCT permission from `plan`: running a proposal and PROMOTING one to the current plan are
   * different privileges, so a narrower role can be granted the first without the second. Both fall
   * under a `projects.*` grant, so the delivery roles already hold them.
   */
  @Permissions('projects.schedule.accept')
  @Post('planning-runs/:runId/accept')
  async acceptPlanningRun(
    @Param('runId') runId: string,
    @Body() dto: { acknowledgeReason?: string } = {},
  ): Promise<{ schedule: ProjectSchedule; run: PlanningRun }> {
    const ctx = this.tenant.get();
    return await this.schedule.acceptRun(ctx.tenantId, runId, {
      acceptedBy: ctx.actorId,
      acknowledgeReason: dto?.acknowledgeReason ?? null,
    });
  }

  /** Reject a proposal outright. The reason is required. Part of planning, not the consequential promote. */
  @Permissions('projects.schedule.plan')
  @Post('planning-runs/:runId/discard')
  async discardPlanningRun(
    @Param('runId') runId: string,
    @Body() dto: { reason?: string } = {},
  ): Promise<PlanningRun> {
    if (!dto?.reason?.trim()) throw new BadRequestException('a discard reason is required');
    return await this.schedule.discardRun(this.tenant.get().tenantId, runId, dto.reason);
  }
}

