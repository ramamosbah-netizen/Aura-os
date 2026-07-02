import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Transmittal,
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

interface CreateTransmittalDto {
  projectId: string;
  projectName?: string;
  code: string;
  title: string;
  sender?: string;
  recipient?: string;
}

interface CreateCorrespondenceDto {
  projectId: string;
  projectName?: string;
  code: string;
  subject: string;
  direction: 'inbound' | 'outbound';
  sender?: string;
  recipient?: string;
}

@Controller('doccontrol')
export class DocControlController {
  constructor(
    private readonly docControlService: DocControlService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Transmittals ──────────────────────────────────────────────────────────

  @Post('transmittals')
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
      createdBy: ctx.actorId || undefined,
    });
  }

  @Put('transmittals/:id/acknowledge')
  acknowledgeTransmittal(@Param('id') id: string): Promise<Transmittal> {
    const ctx = this.tenant.get();
    return this.docControlService.acknowledgeTransmittal(ctx.tenantId, ctx.actorId, id);
  }

  @Get('transmittals')
  listTransmittals(): Promise<Transmittal[]> {
    const ctx = this.tenant.get();
    return this.docControlService.listTransmittals(ctx.tenantId);
  }

  @Post('transmittals/:id/items')
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
    try {
      return await this.docControlService.addTransmittalItems(this.tenant.get().tenantId, id, dto.items);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'attach items failed');
    }
  }

  @Get('transmittals/:id/items')
  listTransmittalItems(@Param('id') id: string): Promise<TransmittalItem[]> {
    return this.docControlService.listTransmittalItems(this.tenant.get().tenantId, id);
  }

  // ── Correspondence ─────────────────────────────────────────────────────────

  @Post('correspondence')
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
  closeCorrespondence(@Param('id') id: string): Promise<Correspondence> {
    const ctx = this.tenant.get();
    return this.docControlService.closeCorrespondence(ctx.tenantId, ctx.actorId, id);
  }

  @Get('correspondence')
  listCorrespondence(): Promise<Correspondence[]> {
    const ctx = this.tenant.get();
    return this.docControlService.listCorrespondence(ctx.tenantId);
  }

  // ── Submittals (document review register) ──────────────────────────────────

  @Post('submittals')
  async createSubmittal(@Body() dto: { projectId: string; projectName?: string; reference: string; title: string; discipline?: Submittal['discipline']; revision?: number }): Promise<Submittal> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.reference?.trim()) throw new BadRequestException('reference is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    try {
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
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('submittals')
  listSubmittals(): Promise<Submittal[]> {
    return this.docControlService.listSubmittals(this.tenant.get().tenantId);
  }

  @Put('submittals/:id/submit')
  async submitSubmittal(@Param('id') id: string): Promise<Submittal> {
    try {
      return await this.docControlService.submitSubmittal(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Put('submittals/:id/return')
  async returnSubmittal(@Param('id') id: string, @Body() dto: { reviewCode: ReviewCode; reviewComments?: string }): Promise<Submittal> {
    if (!['A', 'B', 'C', 'D'].includes(dto?.reviewCode)) throw new BadRequestException('reviewCode must be A, B, C, or D');
    try {
      return await this.docControlService.returnSubmittal(this.tenant.get().tenantId, id, dto.reviewCode, dto.reviewComments);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── Drawing / Document Register ─────────────────────────────────────────────

  @Post('register')
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

  @Put('register/:id/revise')
  async reviseRegisterEntry(
    @Param('id') id: string,
    @Body() dto: { revision: string; status: RegisterStatus; revisionDate?: string },
  ): Promise<DrawingRegisterEntry> {
    if (!dto?.revision?.trim()) throw new BadRequestException('revision is required');
    if (!dto?.status) throw new BadRequestException('status is required');
    try {
      return await this.docControlService.reviseRegisterEntry(this.tenant.get().tenantId, id, dto.revision, dto.status, dto.revisionDate);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('register/:id/history')
  async registerEntryHistory(@Param('id') id: string) {
    try {
      return await this.docControlService.registerEntryHistory(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }
}
