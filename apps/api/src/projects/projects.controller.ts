import { BadRequestException, Body, Controller, Delete, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
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
} from '@aura/projects';

interface CreateProjectDto {
  title: string;
  reference?: string;
  contractId?: string | null;
  contractTitle?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  status?: ProjectStatus;
  value?: number;
}

interface CreateWbsNodeDto {
  projectId: string;
  parentId?: string | null;
  code: string;
  title: string;
  plannedValue?: number;
}

interface CreateCbsNodeDto {
  projectId: string;
  parentId?: string | null;
  code: string;
  title: string;
  category?: CbsCategory;
  budgetAmount?: number;
  currency?: string;
  notes?: string;
}

interface CreateDelayDto {
  projectId: string;
  title: string;
  causeCategory?: string;
  startDate: string;
  endDate?: string;
  delayDays?: number;
  isConcurrent?: boolean;
  linkedActivityCode?: string;
  description?: string;
}

interface CreateEotDto {
  projectId: string;
  title: string;
  submittedDays: number;
  justification?: string;
  originalCompletionDate?: string;
  delayEventIds?: string[];
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
    private readonly tenant: TenantContext,
  ) {}

  // ── PROJECTS ─────────────────────────────────────────────────────────────

  @Post('projects')
  createProject(@Body() dto: CreateProjectDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Project> {
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
      accountName: dto.accountName ?? null,
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
    try {
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
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
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
}

