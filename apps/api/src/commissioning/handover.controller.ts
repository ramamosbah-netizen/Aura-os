import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantContext } from '@aura/core';
import { HandoverService, type HandoverView } from '@aura/commissioning';

class CreateHandoverDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
}

class ChecklistDto {
  @IsOptional() @IsBoolean() omManuals?: boolean;
  @IsOptional() @IsBoolean() asBuilts?: boolean;
  @IsOptional() @IsBoolean() testCertificates?: boolean;
  @IsOptional() @IsBoolean() warrantyDocs?: boolean;
  @IsOptional() @IsBoolean() training?: boolean;
  @IsOptional() @IsBoolean() spares?: boolean;
}

class AcceptDto {
  @IsString() clientRepresentative!: string;
  @IsOptional() @IsString() warrantyStartDate?: string;
  @IsOptional() @IsInt() @Min(0) warrantyMonths?: number;
}

class RejectDto {
  @IsString() reason!: string;
}

/**
 * Handover API — the project-level acceptance that closes ELV delivery. Compile the close-out
 * checklist, submit to the client, and record acceptance (which starts the warranty clock).
 * Each package carries live commissioning stats for its project. Domain guards throw plain
 * Errors classified by the global taxonomy (404 / 409 / 400) — no 500 leaks.
 */
@Controller('commissioning/handovers')
export class HandoverController {
  constructor(
    private readonly service: HandoverService,
    private readonly tenant: TenantContext,
  ) {}

  // ── O&M deliverables (TC-GATE-5) ─────────────────────────────────────────────────────────────
  //
  // Handover's own authority. The document itself stays in DocControl — `documentId` here is a
  // reference, and submitting without one is refused, because "submitted" with nothing to point at
  // is a claim rather than evidence.

  @Get('om-items')
  listOmItems(@Query('projectId') projectId?: string) {
    return this.service.listOmItems(this.tenant.get().tenantId, projectId || undefined);
  }

  @Post('om-items')
  addOmItem(@Body() dto: { commissioningId?: string; deliverable?: string; required?: boolean; notes?: string }) {
    if (!dto?.commissioningId) throw new BadRequestException('commissioningId is required');
    if (!dto?.deliverable) throw new BadRequestException('deliverable is required');
    const ctx = this.tenant.get();
    return this.service.addOmItem(ctx.tenantId, {
      commissioningId: dto.commissioningId,
      deliverable: dto.deliverable as never,
      required: dto.required,
      notes: dto.notes ?? null,
      createdBy: ctx.actorId,
    });
  }

  /** Seed the standard pack for a system — every deliverable a client expects, all still required. */
  @Post('om-items/seed')
  seedOmPack(@Body() dto: { commissioningId?: string }) {
    if (!dto?.commissioningId) throw new BadRequestException('commissioningId is required');
    const ctx = this.tenant.get();
    return this.service.seedOmPack(ctx.tenantId, dto.commissioningId, ctx.actorId);
  }

  @Put('om-items/:id/state')
  advanceOmItem(@Param('id') id: string, @Body() dto: { to?: string; documentId?: string; notes?: string }) {
    if (!dto?.to) throw new BadRequestException('to is required');
    const ctx = this.tenant.get();
    return this.service.advanceOmItem(id, ctx.tenantId, dto.to as never, {
      documentId: dto.documentId ?? null,
      notes: dto.notes ?? null,
      actorId: ctx.actorId,
    });
  }

  @Put('om-items/:id/required')
  setOmItemRequired(@Param('id') id: string, @Body() dto: { required?: boolean; notes?: string }) {
    if (typeof dto?.required !== 'boolean') throw new BadRequestException('required must be true or false');
    return this.service.setOmItemRequired(id, this.tenant.get().tenantId, dto.required, dto.notes ?? null);
  }

  // ── Client training and demonstration (TC-GATE-5) ────────────────────────────────────────────
  //
  // The CLIENT's people, not ours. HSE's training is worker safety — a different authority about
  // different people, and neither may stand in for the other.

  @Get('training')
  listTraining(@Query('projectId') projectId?: string) {
    return this.service.listTrainingSessions(this.tenant.get().tenantId, projectId || undefined);
  }

  @Post('training')
  planTraining(@Body() dto: {
    projectId?: string; commissioningId?: string; title?: string; topics?: string;
    trainer?: string; sessionDate?: string; durationMinutes?: number; materialDocumentId?: string;
  }) {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.service.planTraining(ctx.tenantId, {
      projectId: dto.projectId,
      commissioningId: dto.commissioningId ?? null,
      title: dto.title,
      topics: dto.topics ?? null,
      trainer: dto.trainer ?? null,
      sessionDate: dto.sessionDate ?? null,
      durationMinutes: dto.durationMinutes ?? null,
      materialDocumentId: dto.materialDocumentId ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Put('training/:id/complete')
  completeTraining(@Param('id') id: string, @Body() dto: { attendees?: string; trainer?: string; demonstrationCompleted?: boolean; sessionDate?: string }) {
    if (!dto?.attendees?.trim()) throw new BadRequestException('attendees is required');
    return this.service.completeTraining(id, this.tenant.get().tenantId, {
      attendees: dto.attendees,
      trainer: dto.trainer ?? null,
      demonstrationCompleted: dto.demonstrationCompleted,
      sessionDate: dto.sessionDate ?? null,
    });
  }

  @Put('training/:id/acknowledge')
  acknowledgeTraining(@Param('id') id: string, @Body() dto: { acknowledgedBy?: string }) {
    if (!dto?.acknowledgedBy?.trim()) throw new BadRequestException('acknowledgedBy is required');
    return this.service.acknowledgeTraining(id, this.tenant.get().tenantId, { acknowledgedBy: dto.acknowledgedBy });
  }

  @Post()
  create(@Body() dto: CreateHandoverDto): Promise<HandoverView> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.service.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName ?? null,
      code: dto.code,
      title: dto.title,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(@Query('projectId') projectId?: string): Promise<HandoverView[]> {
    return this.service.list(this.tenant.get().tenantId, projectId);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<HandoverView> {
    const found = await this.service.get(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`handover package ${id} not found`);
    return found;
  }

  @Put(':id/checklist')
  updateChecklist(@Param('id') id: string, @Body() dto: ChecklistDto): Promise<HandoverView> {
    return this.service.updateChecklist(id, this.tenant.get().tenantId, dto);
  }

  /**
   * The dossier (TC-GATE-7) — what the client receives, and what they have already been sent.
   *
   * Declared BEFORE `:id` routes that could swallow it is unnecessary here (the segment is fixed and
   * follows the id), but it is a GET with no side effect and returns 404 for an unknown package
   * rather than an empty dossier, which would read as "nothing to hand over".
   */
  @Get(':id/dossier')
  async dossier(@Param('id') id: string) {
    const found = await this.service.readDossier(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`handover package ${id} not found`);
    return found;
  }

  @Put(':id/submit')
  submit(@Param('id') id: string): Promise<HandoverView> {
    const ctx = this.tenant.get();
    // The actor is stamped on the dossier manifest: "issued by" is part of what was sent.
    return this.service.submit(id, ctx.tenantId, ctx.actorId);
  }

  @Put(':id/accept')
  accept(@Param('id') id: string, @Body() dto: AcceptDto): Promise<HandoverView> {
    if (!dto?.clientRepresentative?.trim()) throw new BadRequestException('clientRepresentative is required');
    return this.service.accept(id, this.tenant.get().tenantId, {
      clientRepresentative: dto.clientRepresentative,
      warrantyStartDate: dto.warrantyStartDate,
      warrantyMonths: dto.warrantyMonths,
    });
  }

  @Put(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto): Promise<HandoverView> {
    if (!dto?.reason?.trim()) throw new BadRequestException('reason is required');
    return this.service.reject(id, this.tenant.get().tenantId, dto.reason);
  }
}
