import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { TenantContext, Permissions } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type Transmittal,
  type TransmittalAcknowledgement,
  type DocumentRevision,
  type Correspondence,
  type Submittal,
  type ReviewCode,
  type DrawingRegisterEntry,
  type RegisterStatus,
  type RegisterDiscipline,
  type RegisterDocType,
  type TransmittalItem,
  type TransmittalPurpose,
  DocControlService
} from '@aura/doccontrol';

class CreateTransmittalDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() sender?: string;
  @IsOptional() @IsString() recipient?: string;
  @IsOptional() @IsString() purpose?: string;
}

class CreateCorrespondenceDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() subject!: string;
  @IsString() direction!: 'inbound' | 'outbound';
  @IsOptional() @IsString() sender?: string;
  @IsOptional() @IsString() recipient?: string;
}

class AckTransmittalDto {
  @IsOptional() @IsString() note?: string;
}

class ApproveDocumentDto {
  @IsOptional() @IsString() comments?: string;
}

class RejectDocumentDto {
  @IsString() reason!: string;
}

class ReviseDocumentDto {
  @IsString() reason!: string;
  @IsOptional() @IsString() revision?: string;
}

@Controller('doccontrol')
export class DocControlController {
  constructor(
    private readonly docControlService: DocControlService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Transmittals ──────────────────────────────────────────────────────────

  @Post('transmittals')
  @Permissions('doccontrol.transmittal.create')
  createTransmittal(@Body() dto: CreateTransmittalDto): Promise<Transmittal> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');

    const ctx = this.tenant.get();
    return this.docControlService.createTransmittal({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      code: dto.code,
      title: dto.title,
      sender: dto.sender,
      recipient: dto.recipient,
      purpose: dto.purpose,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Post('transmittals/:id/send')
  @Permissions('doccontrol.transmittal.send')
  sendTransmittal(@Param('id') id: string): Promise<Transmittal> {
    const ctx = this.tenant.get();
    return this.docControlService.sendTransmittal(ctx.tenantId, ctx.actorId, id);
  }

  @Post('transmittals/:id/receive')
  @Permissions('doccontrol.transmittal.receive')
  receiveTransmittal(@Param('id') id: string): Promise<Transmittal> {
    const ctx = this.tenant.get();
    return this.docControlService.receiveTransmittal(ctx.tenantId, ctx.actorId, id);
  }

  @Put('transmittals/:id/acknowledge')
  @Permissions('doccontrol.transmittal.acknowledge')
  acknowledgeTransmittal(@Param('id') id: string, @Body() dto?: AckTransmittalDto): Promise<Transmittal> {
    const ctx = this.tenant.get();
    return this.docControlService.acknowledgeTransmittal(ctx.tenantId, ctx.actorId, id, dto?.note);
  }

  /**
   * Address a draft conveyance to a named person, in the capacity they receive in.
   *
   * The distribution is fixed at `sent`: after that it is what was conveyed, and adding somebody
   * later would leave a receipt list that no longer matches the act it records.
   */
  @Post('transmittals/:id/recipients')
  @Permissions('doccontrol.transmittal.recipients')
  addTransmittalRecipient(
    @Param('id') id: string,
    @Body() dto: { userId: string; party?: string },
  ) {
    const ctx = this.tenant.get();
    if (!dto?.userId?.trim()) throw new BadRequestException('userId is required');
    return this.docControlService.addTransmittalRecipient({
      tenantId: ctx.tenantId, actorId: ctx.actorId, transmittalId: id,
      userId: dto.userId.trim(), party: dto.party ?? null,
    });
  }

  /**
   * Where the distribution stands — who was addressed, who has answered, who has not.
   *
   * Reported per person rather than as one status, because "the Buyer has it, Site has not" is the
   * fact a chase starts from, and a single flag destroys it.
   */
  @Get('transmittals/:id/receipt')
  transmittalReceipt(@Param('id') id: string) {
    return this.docControlService.transmittalReceipt(this.tenant.get().tenantId, id);
  }

  @Get('transmittals/:id/acknowledgements')
  listTransmittalAcknowledgements(@Param('id') id: string): Promise<TransmittalAcknowledgement[]> {
    const ctx = this.tenant.get();
    return this.docControlService.listTransmittalAcknowledgements(ctx.tenantId, id);
  }

  @Get('transmittals')
  listTransmittals(): Promise<Transmittal[]> {
    const ctx = this.tenant.get();
    return this.docControlService.listTransmittals(ctx.tenantId);
  }

  @Get('transmittals/paged')
  listTransmittalsPaged(@Query('projectId') projectId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.docControlService.listTransmittalsPaged({ tenantId: this.tenant.get().tenantId, projectId }, parsePageParams(limit, offset));
  }

  @Post('transmittals/:id/items')
  @Permissions('doccontrol.transmittal.items')
  async addTransmittalItems(
    @Param('id') id: string,
    @Body() dto: { items: Array<{ registerEntryId: string; revision?: string; purpose?: TransmittalPurpose }> },
  ): Promise<TransmittalItem[]> {
    if (!Array.isArray(dto?.items) || dto.items.length === 0) {
      throw new BadRequestException('at least one item is required');
    }
    if (dto.items.some((i) => !i?.registerEntryId)) {
      throw new BadRequestException('every item needs a registerEntryId');
    }
    // NO BLANKET `catch → BadRequestException` HERE ANY MORE. It turned every refusal this method can
    // make into a 400, including the one this wave added: attaching a document to an already-sent
    // transmittal is a STATE CONFLICT (409), and the caller was told to fix a request that was
    // perfectly well formed. Measured — 400 where the service had correctly said "can only be
    // attached to a draft transmittal". The global taxonomy classifies each message on its own terms:
    // a missing register entry is 404, a cross-project attachment is 400, a frozen conveyance is 409.
    return await this.docControlService.addTransmittalItems(this.tenant.get().tenantId, id, dto.items);
  }

  @Get('transmittals/:id/items')
  listTransmittalItems(@Param('id') id: string): Promise<TransmittalItem[]> {
    return this.docControlService.listTransmittalItems(this.tenant.get().tenantId, id);
  }

  // ── Correspondence ─────────────────────────────────────────────────────────

  @Post('correspondence')
  @Permissions('doccontrol.correspondence.create')
  createCorrespondence(@Body() dto: CreateCorrespondenceDto): Promise<Correspondence> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.subject?.trim()) throw new BadRequestException('subject is required');
    if (dto?.direction !== 'inbound' && dto?.direction !== 'outbound') {
      throw new BadRequestException('direction must be inbound or outbound');
    }

    const ctx = this.tenant.get();
    return this.docControlService.createCorrespondence({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      code: dto.code,
      subject: dto.subject,
      direction: dto.direction,
      sender: dto.sender,
      recipient: dto.recipient,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Put('correspondence/:id/close')
  @Permissions('doccontrol.correspondence.close')
  closeCorrespondence(@Param('id') id: string, @Body() dto: { reason?: string }): Promise<Correspondence> {
    const ctx = this.tenant.get();
    return this.docControlService.closeCorrespondence(ctx.tenantId, ctx.actorId, id, dto?.reason ?? null);
  }

  @Get('correspondence')
  listCorrespondence(): Promise<Correspondence[]> {
    const ctx = this.tenant.get();
    return this.docControlService.listCorrespondence(ctx.tenantId);
  }

  @Get('correspondence/paged')
  listCorrespondencePaged(@Query('projectId') projectId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.docControlService.listCorrespondencePaged({ tenantId: this.tenant.get().tenantId, projectId }, parsePageParams(limit, offset));
  }

  // ── Submittals (document review register) ──────────────────────────────────

  @Post('submittals')
  @Permissions('doccontrol.submittal.create')
  async createSubmittal(@Body() dto: { projectId: string; projectName?: string; reference: string; title: string; discipline?: Submittal['discipline']; revision?: number }): Promise<Submittal> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.reference?.trim()) throw new BadRequestException('reference is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return await this.docControlService.createSubmittal({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      projectId: dto.projectId,
      projectName: dto.projectName,
      reference: dto.reference,
      title: dto.title,
      discipline: dto.discipline,
      revision: dto.revision,
      createdBy: ctx.actorId || null,
    });
  }

  @Get('submittals')
  listSubmittals(): Promise<Submittal[]> {
    return this.docControlService.listSubmittals(this.tenant.get().tenantId);
  }

  @Get('submittals/paged')
  listSubmittalsPaged(@Query('projectId') projectId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.docControlService.listSubmittalsPaged({ tenantId: this.tenant.get().tenantId, projectId }, parsePageParams(limit, offset));
  }

  @Put('submittals/:id/submit')
  @Permissions('doccontrol.submittal.submit')
  async submitSubmittal(@Param('id') id: string): Promise<Submittal> {
    const ctx = this.tenant.get();
    return await this.docControlService.submitSubmittal(ctx.tenantId, ctx.actorId, id);
  }

  @Put('submittals/:id/return')
  @Permissions('doccontrol.submittal.return')
  async returnSubmittal(@Param('id') id: string, @Body() dto: { reviewCode: ReviewCode; reviewComments?: string }): Promise<Submittal> {
    if (!['A', 'B', 'C', 'D'].includes(dto?.reviewCode)) throw new BadRequestException('reviewCode must be A, B, C, or D');
    const ctx = this.tenant.get();
    return await this.docControlService.returnSubmittal(ctx.tenantId, ctx.actorId, id, dto.reviewCode, dto.reviewComments);
  }

  // ── Drawing / Document Register ─────────────────────────────────────────────

  @Post('register')
  @Permissions('doccontrol.register.create')
  createRegisterEntry(
    @Body() dto: { projectId: string; projectName?: string; documentNumber: string; title: string; discipline?: RegisterDiscipline; docType?: RegisterDocType; currentRevision?: string; status?: RegisterStatus; custodian?: string; distribution?: string[]; revisionDate?: string },
  ): Promise<DrawingRegisterEntry> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.documentNumber?.trim()) throw new BadRequestException('documentNumber is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.docControlService.createRegisterEntry({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      documentNumber: dto.documentNumber,
      title: dto.title,
      discipline: dto.discipline,
      docType: dto.docType,
      currentRevision: dto.currentRevision,
      status: dto.status,
      custodian: dto.custodian,
      distribution: dto.distribution,
      revisionDate: dto.revisionDate,
      createdBy: ctx.actorId ?? undefined,
    });
  }

  @Get('register')
  listRegister(@Param('projectId') _p?: string): Promise<DrawingRegisterEntry[]> {
    return this.docControlService.listRegister(this.tenant.get().tenantId);
  }

  @Get('register/paged')
  listRegisterPaged(@Query('projectId') projectId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.docControlService.listRegisterPaged({ tenantId: this.tenant.get().tenantId, projectId }, parsePageParams(limit, offset));
  }

  @Put('register/:id/revise')
  @Permissions('doccontrol.register.revise')
  async reviseRegisterEntry(
    @Param('id') id: string,
    @Body() dto: { revision: string; status: RegisterStatus; revisionDate?: string },
  ): Promise<DrawingRegisterEntry> {
    if (!dto?.revision?.trim()) throw new BadRequestException('revision is required');
    if (!dto?.status) throw new BadRequestException('status is required');
    return await this.docControlService.reviseRegisterEntry(this.tenant.get().tenantId, id, dto.revision, dto.status, dto.revisionDate);
  }

  @Get('register/:id/history')
  registerEntryHistory(@Param('id') id: string) {
    // "register entry not found" is classified to 404 by the global error taxonomy.
    return this.docControlService.registerEntryHistory(this.tenant.get().tenantId, id);
  }

  /** Immutable revision history (the approval journey) for a document. */
  @Get('register/:id/revisions')
  listDocumentRevisions(@Param('id') id: string): Promise<DocumentRevision[]> {
    return this.docControlService.listDocumentRevisions(this.tenant.get().tenantId, id);
  }

  // ── Governed document-approval lifecycle (POST verbs on a revision, never PATCH status) ──

  @Get('revisions/:revId')
  getRevision(@Param('revId') revId: string): Promise<DocumentRevision | null> {
    return this.docControlService.getDocumentRevision(this.tenant.get().tenantId, revId);
  }

  @Post('revisions/:revId/submit')
  @Permissions('doccontrol.revision.submit')
  submitDocument(@Param('revId') revId: string): Promise<DocumentRevision> {
    const ctx = this.tenant.get();
    return this.docControlService.submitDocument(ctx.tenantId, ctx.actorId, revId);
  }

  @Post('revisions/:revId/start-review')
  @Permissions('doccontrol.revision.start-review')
  startReviewDocument(@Param('revId') revId: string): Promise<DocumentRevision> {
    const ctx = this.tenant.get();
    return this.docControlService.startReviewDocument(ctx.tenantId, ctx.actorId, revId);
  }

  @Post('revisions/:revId/approve')
  @Permissions('doccontrol.revision.approve')
  approveDocument(@Param('revId') revId: string, @Body() dto?: ApproveDocumentDto): Promise<DocumentRevision> {
    const ctx = this.tenant.get();
    return this.docControlService.approveDocument(ctx.tenantId, ctx.actorId, revId, dto?.comments);
  }

  @Post('revisions/:revId/reject')
  @Permissions('doccontrol.revision.approve')
  rejectDocument(@Param('revId') revId: string, @Body() dto: RejectDocumentDto): Promise<DocumentRevision> {
    if (!dto?.reason?.trim()) throw new BadRequestException('a rejection reason is required');
    const ctx = this.tenant.get();
    return this.docControlService.rejectDocument(ctx.tenantId, ctx.actorId, revId, dto.reason);
  }

  @Post('revisions/:revId/issue')
  @Permissions('doccontrol.revision.issue')
  issueDocument(@Param('revId') revId: string): Promise<DocumentRevision> {
    const ctx = this.tenant.get();
    return this.docControlService.issueDocument(ctx.tenantId, ctx.actorId, revId);
  }

  @Post('revisions/:revId/revise')
  @Permissions('doccontrol.register.revise')
  reviseDocument(@Param('revId') revId: string, @Body() dto: ReviseDocumentDto): Promise<DocumentRevision> {
    if (!dto?.reason?.trim()) throw new BadRequestException('reason for the new revision is required');
    const ctx = this.tenant.get();
    return this.docControlService.createRevision(ctx.tenantId, ctx.actorId, revId, dto.reason, dto.revision);
  }
}
