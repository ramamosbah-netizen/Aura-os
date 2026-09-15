import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Permissions, TenantContext } from '@aura/core';
import { ProjectResponsibilityService } from '@aura/projects';
import { parsePageParams } from '@aura/shared';
import {
  type Drawing,
  type DrawingSubmission,
  type DrawingReview,
  type ReviewOutcome,
  type Rfi,
  type Submittal,
  type DrawingStatus,
  type SubmittalStatus,
  type SubmittalType,
  type TechnicalQuery,
  type TqPriority,
  type TqDiscipline,
  type BimModel,
  type ModelDiscipline,
  type ModelFormat,
  type ModelStatus,
  type Discipline,
  type DesignChange,
  type DesignChangeStatus,
  type DesignChangeType,
  type EngineeringDocument,
  type DocType,
  type DocumentStatus,
  DOCUMENT_DEFINITIONS,
  EngineeringService
} from '@aura/engineering';

// Shop Drawings DTOs
class CreateDrawingDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() revision?: string;
  @IsOptional() @IsString() status?: DrawingStatus;
  @IsOptional() @IsString() discipline?: Discipline;
  /**
   * A link to the document this revision draws on, held wherever the project keeps its files —
   * AURA has no object store, and this is a citation, not a copy. The aggregate has carried
   * `fileUrl` since it was written and `revise` has always accepted one; the create DTO never
   * did, so the first revision of a drawing could not cite its own document.
   */
  @IsOptional() @IsString() fileUrl?: string;
}

class SubmitDrawingDto {
  @IsOptional() @IsString() recipient?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() comments?: string;
}

class ReviewDrawingDto {
  @IsString() outcome!: ReviewOutcome;
  @IsOptional() @IsString() comments?: string;
}

class ReviseDrawingDto {
  @IsString() reason!: string;
  @IsOptional() @IsString() revision?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() fileUrl?: string;
}

class TransmitDrawingDto {
  @IsOptional() @IsString() recipient?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() transmittalRef?: string;
  @IsOptional() @IsString() responsibilityId?: string;
}

// RFIs DTOs
class CreateRfiDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsString() question!: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() discipline?: Discipline;
}

class AnswerRfiDto {
  @IsString() answer!: string;
}

// Technical Submittals DTOs
class CreateSubmittalDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsString() submittalType!: SubmittalType;
  @IsOptional() @IsString() status?: SubmittalStatus;
  @IsOptional() @IsString() discipline?: Discipline;
}

class UpdateSubmittalStatusDto {
  @IsString() status!: SubmittalStatus;
}

// Design Change DTOs
class CreateDesignChangeDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() discipline?: Discipline;
  @IsOptional() @IsString() changeType?: DesignChangeType;
  @IsOptional() costImpact?: boolean;
  @IsOptional() estimatedValue?: number;
}

class DecideDesignChangeDto {
  @IsString() status!: DesignChangeStatus;
}

// Engineering Document DTOs (one aggregate, many docTypes)
class CreateDocumentDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsString() docType!: DocType;
  @IsOptional() @IsString() discipline?: Discipline;
  @IsOptional() @IsString() revision?: string;
  @IsOptional() fields?: Record<string, unknown>;
}

class TransitionDocumentDto {
  @IsString() status!: DocumentStatus;
}

@Controller('engineering')
export class EngineeringController {
  constructor(
    private readonly engineeringService: EngineeringService,
    private readonly projectResponsibilities: ProjectResponsibilityService,
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
      discipline: dto.discipline,
      // See the DTO: `revise` could always cite a document, `create` could not.
      fileUrl: dto.fileUrl,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  // ── Drawing workflow commands (state machine; POST verbs, never PATCH status) ──

  @Post('drawings/:id/submit')
  submitDrawing(@Param('id') id: string, @Body() dto: SubmitDrawingDto): Promise<Drawing> {
    const ctx = this.tenant.get();
    return this.engineeringService.submitDrawing(ctx.tenantId, ctx.actorId, id, {
      recipient: dto?.recipient,
      purpose: dto?.purpose,
      dueDate: dto?.dueDate,
      comments: dto?.comments,
    });
  }

  @Post('drawings/:id/start-review')
  startReviewDrawing(@Param('id') id: string): Promise<Drawing> {
    const ctx = this.tenant.get();
    return this.engineeringService.startReviewDrawing(ctx.tenantId, ctx.actorId, id);
  }

  @Post('drawings/:id/review')
  reviewDrawing(@Param('id') id: string, @Body() dto: ReviewDrawingDto): Promise<Drawing> {
    if (!dto?.outcome) throw new BadRequestException('outcome is required');
    const ctx = this.tenant.get();
    return this.engineeringService.reviewDrawing(ctx.tenantId, ctx.actorId, id, {
      outcome: dto.outcome,
      comments: dto.comments,
    });
  }

  @Post('drawings/:id/revise')
  reviseDrawing(@Param('id') id: string, @Body() dto: ReviseDrawingDto): Promise<Drawing> {
    if (!dto?.reason?.trim()) throw new BadRequestException('reason for revision is required');
    const ctx = this.tenant.get();
    return this.engineeringService.reviseDrawing(ctx.tenantId, ctx.actorId, id, {
      reason: dto.reason,
      revision: dto.revision,
      title: dto.title,
      fileUrl: dto.fileUrl,
    });
  }

  @Post('drawings/:id/transmit')
  async transmitDrawing(@Param('id') id: string, @Body() dto: TransmitDrawingDto): Promise<Drawing> {
    if (!dto?.recipient?.trim()) throw new BadRequestException('recipient is required');
    if (!dto?.purpose?.trim()) throw new BadRequestException('purpose is required');
    const ctx = this.tenant.get();
    if (dto.responsibilityId) {
      const [drawing, responsibility] = await Promise.all([
        this.engineeringService.getDrawing(id),
        this.projectResponsibilities.get(dto.responsibilityId),
      ]);
      if (!drawing) throw new NotFoundException('drawing not found');
      if (!responsibility || responsibility.projectId !== drawing.projectId || responsibility.workstream !== 'engineering_release') {
        throw new BadRequestException('responsibility must be an engineering release receipt for this drawing project');
      }
      if (responsibility.status === 'completed') {
        throw new BadRequestException('completed responsibility cannot receive a new engineering release');
      }
      if (responsibility.sourceId && responsibility.sourceId !== drawing.id) {
        throw new BadRequestException('responsibility is already linked to another engineering release');
      }
    }
    return this.engineeringService.transmitDrawing(ctx.tenantId, ctx.actorId, id, {
      recipient: dto?.recipient,
      purpose: dto?.purpose,
      transmittalRef: dto?.transmittalRef,
      responsibilityId: dto?.responsibilityId,
    });
  }

  @Post('drawings/:id/close')
  closeDrawing(@Param('id') id: string): Promise<Drawing> {
    const ctx = this.tenant.get();
    return this.engineeringService.closeDrawing(ctx.tenantId, ctx.actorId, id);
  }

  @Get('drawings/:id/submissions')
  listDrawingSubmissions(@Param('id') id: string): Promise<DrawingSubmission[]> {
    const ctx = this.tenant.get();
    return this.engineeringService.listDrawingSubmissions(ctx.tenantId, id);
  }

  @Get('drawings/:id/reviews')
  listDrawingReviews(@Param('id') id: string): Promise<DrawingReview[]> {
    const ctx = this.tenant.get();
    return this.engineeringService.listDrawingReviews(ctx.tenantId, id);
  }

  // Declared before `drawings/:id` so `revisions` is not captured as an :id.
  @Get('drawings/revisions')
  listDrawingRevisions(
    @Query('projectId') projectId: string,
    @Query('code') code: string,
  ): Promise<Drawing[]> {
    if (!projectId || !code) throw new BadRequestException('projectId and code are required');
    const ctx = this.tenant.get();
    return this.engineeringService.listDrawingRevisions(ctx.tenantId, projectId, code);
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
      discipline: dto.discipline,
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
      discipline: dto.discipline,
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

  // ── Design Changes ───────────────────────────────────────────────────────────

  @Post('design-changes')
  createDesignChange(@Body() dto: CreateDesignChangeDto): Promise<DesignChange> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');

    const ctx = this.tenant.get();
    return this.engineeringService.createDesignChange({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName,
      code: dto.code,
      title: dto.title,
      description: dto.description,
      discipline: dto.discipline,
      changeType: dto.changeType,
      costImpact: dto.costImpact,
      estimatedValue: dto.estimatedValue,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Put('design-changes/:id/decision')
  decideDesignChange(@Param('id') id: string, @Body() dto: DecideDesignChangeDto): Promise<DesignChange> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const ctx = this.tenant.get();
    return this.engineeringService.decideDesignChange(ctx.tenantId, ctx.actorId, id, dto.status);
  }

  @Get('design-changes')
  listDesignChanges(
    @Query('projectId') projectId?: string,
    @Query('status') status?: DesignChange['status'],
  ): Promise<DesignChange[]> {
    const ctx = this.tenant.get();
    return this.engineeringService.listDesignChanges({ tenantId: ctx.tenantId, projectId, status, limit: 100 });
  }

  @Get('design-changes/paged')
  pagedDesignChanges(
    @Query('projectId') projectId?: string,
    @Query('status') status?: DesignChange['status'],
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.engineeringService.listDesignChangesPaged(
      { tenantId: this.tenant.get().tenantId, projectId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get('design-changes/:id')
  async getDesignChange(@Param('id') id: string): Promise<DesignChange> {
    const found = await this.engineeringService.getDesignChange(id);
    if (!found) throw new NotFoundException(`Design change ${id} not found`);
    return found;
  }

  // ── Engineering Documents (one aggregate, many docTypes) ─────────────────────

  /** The docType catalog — each type's Definition (label, owning module, form schema, workflow). */
  @Get('document-types')
  documentTypes() {
    return Object.values(DOCUMENT_DEFINITIONS);
  }

  @Post('documents')
  createDocument(@Body() dto: CreateDocumentDto): Promise<EngineeringDocument> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.docType || !DOCUMENT_DEFINITIONS[dto.docType]) throw new BadRequestException('a valid docType is required');

    const ctx = this.tenant.get();
    return this.engineeringService.createDocument({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName,
      code: dto.code,
      title: dto.title,
      docType: dto.docType,
      discipline: dto.discipline,
      revision: dto.revision,
      fields: dto.fields,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Put('documents/:id/transition')
  transitionDocument(@Param('id') id: string, @Body() dto: TransitionDocumentDto): Promise<EngineeringDocument> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const ctx = this.tenant.get();
    return this.engineeringService.transitionDocument(ctx.tenantId, ctx.actorId, id, dto.status);
  }

  @Get('documents')
  listDocuments(
    @Query('projectId') projectId?: string,
    @Query('docType') docType?: DocType,
    @Query('status') status?: EngineeringDocument['status'],
  ): Promise<EngineeringDocument[]> {
    const ctx = this.tenant.get();
    return this.engineeringService.listDocuments({ tenantId: ctx.tenantId, projectId, docType, status, limit: 100 });
  }

  @Get('documents/paged')
  pagedDocuments(
    @Query('projectId') projectId?: string,
    @Query('docType') docType?: DocType,
    @Query('status') status?: EngineeringDocument['status'],
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.engineeringService.listDocumentsPaged(
      { tenantId: this.tenant.get().tenantId, projectId, docType, status },
      parsePageParams(limit, offset),
    );
  }

  @Get('documents/:id')
  async getDocument(@Param('id') id: string): Promise<EngineeringDocument> {
    const found = await this.engineeringService.getDocument(id);
    if (!found) throw new NotFoundException(`Engineering document ${id} not found`);
    return found;
  }

  // ── Technical Queries (TQ) ──────────────────────────────────────────────────

  // EXPLICIT, and not decoration. Derivation would produce `engineering.technical-query.*` from the
  // route while the service asserts `engineering.tq.*` — two vocabularies for one exchange, so a
  // role holding the one it names is refused by the guard for the other. Naming the permission here
  // makes the guard and the service agree on a single word.
  @Permissions('engineering.tq.create')
  @Post('technical-queries')
  createTq(
    @Body() dto: { projectId: string; projectName?: string; code: string; title: string; query: string; priority?: TqPriority; discipline?: TqDiscipline; drawingReference?: string; drawingId?: string; costImpact?: boolean; timeImpact?: boolean; assignedTo?: string },
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
      drawingId: dto.drawingId ?? null,
      costImpact: dto.costImpact,
      timeImpact: dto.timeImpact,
      assignedTo: dto.assignedTo ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Permissions('engineering.tq.read')
  @Get('technical-queries')
  listTqs(
    @Query('projectId') projectId?: string,
    @Query('status') status?: TechnicalQuery['status'],
  ): Promise<TechnicalQuery[]> {
    return this.engineeringService.listTechnicalQueries({ tenantId: this.tenant.get().tenantId, projectId, status, limit: 100 });
  }

  @Permissions('engineering.tq.read')
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

  @Permissions('engineering.tq.read')
  @Get('technical-queries/:id')
  async getTq(@Param('id') id: string): Promise<TechnicalQuery> {
    const found = await this.engineeringService.getTechnicalQuery(id);
    if (!found) throw new NotFoundException(`technical query ${id} not found`);
    return found;
  }

  /**
   * Record the design decision, or replace one that already stands.
   *
   * Replacing costs a reason and keeps what it displaced: site builds to a TQ answer, so one that
   * changed silently would mean work done to an instruction that no longer exists anywhere.
   */
  @Permissions('engineering.tq.respond')
  @Put('technical-queries/:id/respond')
  async respondTq(
    @Param('id') id: string,
    @Body() dto: { response: string; supersededReason?: string },
  ): Promise<TechnicalQuery> {
    if (!dto?.response?.trim()) throw new BadRequestException('response is required');
    const ctx = this.tenant.get();
    return await this.engineeringService.respondTechnicalQuery(ctx.tenantId, ctx.actorId, id, {
      response: dto.response, supersededReason: dto.supersededReason ?? null,
    });
  }

  /**
   * Close the loop: the raising side accepts the answer as adequate to build to.
   *
   * A different permission from responding, and the domain refuses a self-close even where one
   * person holds both — nobody declares their own design decision good enough.
   */
  @Permissions('engineering.tq.close')
  @Put('technical-queries/:id/close')
  async closeTq(@Param('id') id: string): Promise<TechnicalQuery> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new BadRequestException('a signed-in user is required to close a technical query');
    return await this.engineeringService.closeTechnicalQuery(ctx.tenantId, ctx.actorId, id);
  }

  /** Every answer this query has had that was later replaced, oldest first. */
  @Permissions('engineering.tq.read')
  @Get('technical-queries/:id/responses')
  async tqResponseHistory(@Param('id') id: string) {
    return await this.engineeringService.technicalQueryResponseHistory(this.tenant.get().tenantId, id);
  }

  // ── BIM / model registry (viewer backbone) ──────────────────────────────────

  @Post('bim-models')
  registerBimModel(
    @Body() dto: { projectId: string; projectName?: string; code: string; name: string; discipline?: ModelDiscipline; format?: ModelFormat; storageKey?: string; fileUrl?: string; revision?: string; status?: ModelStatus; fileSizeBytes?: number; federationGroup?: string; notes?: string },
  ): Promise<BimModel> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
    return this.engineeringService.registerBimModel({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName ?? null,
      code: dto.code,
      name: dto.name,
      discipline: dto.discipline,
      format: dto.format,
      storageKey: dto.storageKey ?? null,
      fileUrl: dto.fileUrl ?? null,
      revision: dto.revision,
      status: dto.status,
      fileSizeBytes: dto.fileSizeBytes ?? null,
      federationGroup: dto.federationGroup ?? null,
      notes: dto.notes ?? null,
      uploadedBy: ctx.actorId,
    });
  }

  @Get('bim-models')
  listBimModels(
    @Query('projectId') projectId?: string,
    @Query('discipline') discipline?: string,
    @Query('status') status?: string,
  ): Promise<BimModel[]> {
    return this.engineeringService.listBimModels({ tenantId: this.tenant.get().tenantId, projectId, discipline, status, limit: 200 });
  }

  @Get('bim-models/paged')
  pagedBimModels(
    @Query('projectId') projectId?: string,
    @Query('discipline') discipline?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.engineeringService.listBimModelsPaged(
      { tenantId: this.tenant.get().tenantId, projectId, discipline, status },
      parsePageParams(limit, offset),
    );
  }

  @Get('bim-models/:id')
  async getBimModel(@Param('id') id: string): Promise<BimModel> {
    const found = await this.engineeringService.getBimModel(id);
    if (!found) throw new NotFoundException(`BIM model ${id} not found`);
    return found;
  }

  @Put('bim-models/:id/version')
  async newBimModelVersion(
    @Param('id') id: string,
    @Body() dto: { revision: string; storageKey?: string; fileUrl?: string; fileSizeBytes?: number; status?: ModelStatus },
  ): Promise<BimModel> {
    if (!dto?.revision?.trim()) throw new BadRequestException('revision is required');
    return await this.engineeringService.newBimModelVersion(this.tenant.get().tenantId, id, dto);
  }
}
