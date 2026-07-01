import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type Drawing,
  type Rfi,
  type Submittal,
  type DrawingStatus,
  type SubmittalStatus,
  type SubmittalType,
  type TechnicalQuery,
  type TqPriority,
  type TqDiscipline,
  EngineeringService
} from '@aura/engineering';

// Shop Drawings DTOs
interface CreateDrawingDto {
  projectId: string;
  projectName?: string;
  code: string;
  title: string;
  revision?: string;
  status?: DrawingStatus;
}

interface ReviseDrawingDto {
  revision: string;
  title?: string;
}

// RFIs DTOs
interface CreateRfiDto {
  projectId: string;
  projectName?: string;
  code: string;
  title: string;
  question: string;
  assignedTo?: string;
}

interface AnswerRfiDto {
  answer: string;
}

// Technical Submittals DTOs
interface CreateSubmittalDto {
  projectId: string;
  projectName?: string;
  code: string;
  title: string;
  submittalType: SubmittalType;
  status?: SubmittalStatus;
}

interface UpdateSubmittalStatusDto {
  status: SubmittalStatus;
}

@Controller('engineering')
export class EngineeringController {
  constructor(
    private readonly engineeringService: EngineeringService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Shop Drawings ──────────────────────────────────────────────────────────

  @Post('drawings')
  createDrawing(@Body() dto: CreateDrawingDto): Promise<Drawing> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');

    const ctx = this.tenant.get();
    return this.engineeringService.createDrawing({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName,
      code: dto.code,
      title: dto.title,
      revision: dto.revision,
      status: dto.status,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Put('drawings/:id/revision')
  reviseDrawing(@Param('id') id: string, @Body() dto: ReviseDrawingDto): Promise<Drawing> {
    if (!dto?.revision?.trim()) throw new BadRequestException('revision is required');
    const ctx = this.tenant.get();
    return this.engineeringService.reviseDrawing(ctx.tenantId, ctx.actorId, id, {
      revision: dto.revision,
      title: dto.title,
    });
  }

  @Put('drawings/:id/approve')
  approveDrawing(@Param('id') id: string): Promise<Drawing> {
    const ctx = this.tenant.get();
    return this.engineeringService.approveDrawing(ctx.tenantId, ctx.actorId, id);
  }

  @Get('drawings')
  listDrawings(
    @Query('projectId') projectId?: string,
    @Query('status') status?: DrawingStatus,
  ): Promise<Drawing[]> {
    const ctx = this.tenant.get();
    return this.engineeringService.listDrawings({
      tenantId: ctx.tenantId,
      projectId,
      status,
      limit: 100,
    });
  }

  @Get('drawings/paged')
  pagedDrawings(
    @Query('projectId') projectId?: string,
    @Query('status') status?: DrawingStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.engineeringService.listDrawingsPaged(
      { tenantId: this.tenant.get().tenantId, projectId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get('drawings/:id')
  async getDrawing(@Param('id') id: string): Promise<Drawing> {
    const found = await this.engineeringService.getDrawing(id);
    if (!found) throw new NotFoundException(`Drawing ${id} not found`);
    return found;
  }

  // ── RFIs ───────────────────────────────────────────────────────────────────

  @Post('rfis')
  createRfi(@Body() dto: CreateRfiDto): Promise<Rfi> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.question?.trim()) throw new BadRequestException('question is required');

    const ctx = this.tenant.get();
    return this.engineeringService.createRfi({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName,
      code: dto.code,
      title: dto.title,
      question: dto.question,
      assignedTo: dto.assignedTo,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Put('rfis/:id/answer')
  answerRfi(@Param('id') id: string, @Body() dto: AnswerRfiDto): Promise<Rfi> {
    if (!dto?.answer?.trim()) throw new BadRequestException('answer is required');
    const ctx = this.tenant.get();
    return this.engineeringService.answerRfi(ctx.tenantId, ctx.actorId, id, dto.answer);
  }

  @Get('rfis')
  listRfis(
    @Query('projectId') projectId?: string,
    @Query('status') status?: Rfi['status'],
  ): Promise<Rfi[]> {
    const ctx = this.tenant.get();
    return this.engineeringService.listRfis({
      tenantId: ctx.tenantId,
      projectId,
      status,
      limit: 100,
    });
  }

  @Get('rfis/paged')
  pagedRfis(
    @Query('projectId') projectId?: string,
    @Query('status') status?: Rfi['status'],
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.engineeringService.listRfisPaged(
      { tenantId: this.tenant.get().tenantId, projectId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get('rfis/:id')
  async getRfi(@Param('id') id: string): Promise<Rfi> {
    const found = await this.engineeringService.getRfi(id);
    if (!found) throw new NotFoundException(`RFI ${id} not found`);
    return found;
  }

  // ── Technical Submittals ───────────────────────────────────────────────────

  @Post('submittals')
  createSubmittal(@Body() dto: CreateSubmittalDto): Promise<Submittal> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.submittalType) throw new BadRequestException('submittalType is required');

    const ctx = this.tenant.get();
    return this.engineeringService.createSubmittal({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName,
      code: dto.code,
      title: dto.title,
      submittalType: dto.submittalType,
      status: dto.status,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Put('submittals/:id/status')
  updateSubmittalStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSubmittalStatusDto,
  ): Promise<Submittal> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const ctx = this.tenant.get();
    return this.engineeringService.updateSubmittalStatus(ctx.tenantId, ctx.actorId, id, dto.status);
  }

  @Get('submittals')
  listSubmittals(
    @Query('projectId') projectId?: string,
    @Query('status') status?: SubmittalStatus,
  ): Promise<Submittal[]> {
    const ctx = this.tenant.get();
    return this.engineeringService.listSubmittals({
      tenantId: ctx.tenantId,
      projectId,
      status,
      limit: 100,
    });
  }

  @Get('submittals/paged')
  pagedSubmittals(
    @Query('projectId') projectId?: string,
    @Query('status') status?: SubmittalStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.engineeringService.listSubmittalsPaged(
      { tenantId: this.tenant.get().tenantId, projectId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get('submittals/:id')
  async getSubmittal(@Param('id') id: string): Promise<Submittal> {
    const found = await this.engineeringService.getSubmittal(id);
    if (!found) throw new NotFoundException(`Submittal ${id} not found`);
    return found;
  }

  // ── Technical Queries (TQ) ──────────────────────────────────────────────────

  @Post('technical-queries')
  createTq(
    @Body() dto: { projectId: string; projectName?: string; code: string; title: string; query: string; priority?: TqPriority; discipline?: TqDiscipline; drawingReference?: string; costImpact?: boolean; timeImpact?: boolean; assignedTo?: string },
  ): Promise<TechnicalQuery> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.query?.trim()) throw new BadRequestException('query is required');
    const ctx = this.tenant.get();
    return this.engineeringService.createTechnicalQuery({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName ?? null,
      code: dto.code,
      title: dto.title ?? dto.code,
      query: dto.query,
      priority: dto.priority,
      discipline: dto.discipline,
      drawingReference: dto.drawingReference ?? null,
      costImpact: dto.costImpact,
      timeImpact: dto.timeImpact,
      assignedTo: dto.assignedTo ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Get('technical-queries')
  listTqs(
    @Query('projectId') projectId?: string,
    @Query('status') status?: TechnicalQuery['status'],
  ): Promise<TechnicalQuery[]> {
    return this.engineeringService.listTechnicalQueries({ tenantId: this.tenant.get().tenantId, projectId, status, limit: 100 });
  }

  @Get('technical-queries/paged')
  pagedTqs(
    @Query('projectId') projectId?: string,
    @Query('status') status?: TechnicalQuery['status'],
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.engineeringService.listTechnicalQueriesPaged(
      { tenantId: this.tenant.get().tenantId, projectId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get('technical-queries/:id')
  async getTq(@Param('id') id: string): Promise<TechnicalQuery> {
    const found = await this.engineeringService.getTechnicalQuery(id);
    if (!found) throw new NotFoundException(`technical query ${id} not found`);
    return found;
  }

  @Put('technical-queries/:id/respond')
  async respondTq(@Param('id') id: string, @Body() dto: { response: string }): Promise<TechnicalQuery> {
    if (!dto?.response?.trim()) throw new BadRequestException('response is required');
    const ctx = this.tenant.get();
    try {
      return await this.engineeringService.respondTechnicalQuery(ctx.tenantId, ctx.actorId, id, dto.response);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
