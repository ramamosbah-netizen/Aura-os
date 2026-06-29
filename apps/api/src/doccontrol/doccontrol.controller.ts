import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Transmittal,
  type Correspondence,
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
}
