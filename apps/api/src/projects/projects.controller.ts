import { BadRequestException, Body, Controller, Delete, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type Project,
  type ProjectStatus,
  ProjectService,
  type WbsNode,
  type WbsNodeStatus,
  WbsService,
  type EvmMetrics,
  type CbsNode,
  type CbsCategory,
  type CbsSummary,
  CbsService,
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
  type ProjectCashflowForecast,
  type CashflowSummary,
  type NewCashflowPeriod,
  CashflowForecastService,
  type ProjectSchedule,
  type ScheduleSummary,
  type NewScheduleTask,
  type PlanTaskInput,
  type SchedulePlan,
  ScheduleService,
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
  @IsOptional() @IsString() status?: ProjectStatus;
  @IsOptional() @IsNumber() value?: number;
}

class UpdateProjectDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() status?: ProjectStatus;
  @IsOptional() @IsNumber() value?: number;
}

class CreateWbsNodeDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsNumber() plannedValue?: number;
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

/** Projects API — stamps tenant/actor from context, delegates to Services. */
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectService,
    private readonly wbs: WbsService,
    private readonly cbs: CbsService,
    private readonly delayEot: DelayEotService,
    private readonly variations: VariationService,
    private readonly closeouts: CloseoutService,
    private readonly cashflow: CashflowForecastService,
    private readonly schedule: ScheduleService,
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
    try {
      return await this.projects.update(id, {
        title: dto.title,
        reference: dto.reference,
        status: dto.status,
        value: dto.value,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  /** Execution lifecycle: planned → active → completed (completes the contract via the reactor). */
  @Patch('projects/:id/status')
  async changeProjectStatus(@Param('id') id: string, @Body() dto: { status: 'active' | 'completed' | 'cancelled' }): Promise<Project> {
    if (!dto?.status) throw new BadRequestException('status is required');
    try {
      return await this.projects.changeStatus(id, dto.status);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'transition failed');
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
      plannedValue: dto.plannedValue ?? 0,
      createdBy: ctx.actorId,
    });
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
    const ctx = this.tenant.get();
    return this.wbs.updateProgress(id, dto.progress, dto.status, ctx.actorId ?? undefined);
  }

  // ── CBS (COST BREAKDOWN STRUCTURE) ───────────────────────────────────────

  @Post('cbs')
  createCbsNode(@Body() dto: CreateCbsNodeDto): Promise<CbsNode> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.cbs.create({
      tenantId: ctx.tenantId,
      projectId: dto.projectId,
      parentId: dto.parentId ?? null,
      code: dto.code,
      title: dto.title,
      category: dto.category,
      budgetAmount: dto.budgetAmount,
      currency: dto.currency,
      notes: dto.notes,
    });
  }

  @Get('cbs')
  listCbsNodes(@Query('projectId') projectId?: string): Promise<CbsNode[]> {
    return this.cbs.list(projectId ? { projectId } : undefined);
  }

  @Get('cbs/summary/:projectId')
  getCbsSummary(@Param('projectId') projectId: string): Promise<CbsSummary> {
    return this.cbs.getSummary(projectId);
  }

  @Patch('cbs/:id')
  async updateCbsNode(
    @Param('id') id: string,
    @Body() dto: Partial<Pick<CbsNode, 'title' | 'category' | 'budgetAmount' | 'committedAmount' | 'actualAmount' | 'forecastAmount' | 'notes'>>,
  ): Promise<CbsNode> {
    return this.cbs.update(id, dto);
  }

  @Delete('cbs/:id')
  async deleteCbsNode(@Param('id') id: string): Promise<{ deleted: true }> {
    await this.cbs.delete(id);
    return { deleted: true };
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
    });
  }

  @Get('eot-claims')
  listEotClaims(@Query('projectId') projectId?: string): Promise<EotClaim[]> {
    return this.delayEot.listEotClaims(projectId ? { projectId } : undefined);
  }

  @Post('eot-claims/:id/submit')
  submitEotClaim(@Param('id') id: string): Promise<EotClaim> {
    return this.delayEot.submitEotClaim(id);
  }

  // ── VARIATION ORDERS (change orders) ─────────────────────────────────────

  @Post('variations')
  createVariation(@Body() dto: { projectId: string; projectTitle?: string; title: string; description?: string; type: VariationType; amount: number; reference?: string }): Promise<VariationOrder> {
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
    return await this.closeouts.finalize(this.tenant.get().tenantId, id, dto.handoverDate, dto.dlpMonths);
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
  @Post('schedules/plan')
  planSchedule(
    @Body() dto: { projectStart: string; tasks: PlanTaskInput[]; capacity?: Record<string, number> },
  ): SchedulePlan {
    if (!dto?.projectStart) throw new BadRequestException('projectStart (YYYY-MM-DD) is required');
    if (!Array.isArray(dto?.tasks) || dto.tasks.length === 0) throw new BadRequestException('at least one task is required');
    return this.schedule.plan(dto.tasks, dto.projectStart, dto.capacity);
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
}

