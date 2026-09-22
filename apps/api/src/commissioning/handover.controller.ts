import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { DmsService, Permissions, TenantContext } from '@aura/core';
import {
  ACCEPTANCE_METHOD_EVIDENCE,
  type AcceptanceMethod,
  HandoverService,
  type HandoverView,
} from '@aura/commissioning';

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
  /**
   * HOW the client accepted: `electronic`, `paper` or `email`. Omitted means the legacy
   * `name-only` acceptance, which stays valid and is never rendered as an evidenced one.
   */
  @IsOptional() @IsString() acceptanceMethod?: AcceptanceMethod;
  /**
   * WHAT PROVES IT, as a `data:` URL — the signature the pad produced, a scan of the signed
   * acceptance, or the confirming message exported to a file.
   *
   * A STRING RATHER THAN A MULTIPART FILE, deliberately. Acceptance is one act, and splitting it
   * into "upload, then accept" would let a package be accepted with nothing proving it and have
   * evidence bolted on afterwards by somebody else. The bytes are decoded and stored server-side,
   * so what is governed is the same as for any other upload; only the transport differs.
   *
   * THE LIMIT IS REAL AND IS STATED: a JSON body is capped at 2MB for the whole API, so the
   * decoded evidence is capped below that. A pad signature is a few kilobytes and a compressed
   * scan comfortably fits; anything larger is refused with a message that says so rather than
   * dying in the body parser.
   */
  @IsOptional() @IsString() acceptanceEvidence?: string;
}

class RejectDto {
  @IsString() reason!: string;
}

/**
 * A signature pad produces `data:image/png;base64,…`, and a scan read in the browser produces
 * the same shape. Turn either into bytes we can store.
 *
 * The media type here decides only the FILE NAME'S EXTENSION and what we declare to storage.
 * Whether the bytes may be kept under `signature` is decided by DmsService from the content
 * itself, so a caller relabelling a spreadsheet as `image/png` changes the extension and nothing
 * that matters.
 *
 * The cap is on the DECODED length. A signature is a few kilobytes of ink; the limit exists so a
 * JSON body cannot be used to push a large file through a route that is not an upload route, and
 * it is generous enough for a scanned page.
 */
/**
 * Below the API's own 2MB JSON body limit, so an oversized file is refused by a message that
 * explains itself rather than by the body parser. Base64 inflates by a third, so the decoded cap
 * has to leave room for the encoding as well as the rest of the request.
 */
const EVIDENCE_MAX_BYTES = 1_200_000;
const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?(;charset=[a-z0-9-]+)?;base64,([a-z0-9+/=\s]+)$/i;

function decodeDataUrl(value: string): { data: Buffer; contentType: string; extension: string } {
  const match = DATA_URL.exec(value.trim());
  if (!match) {
    throw new BadRequestException('the acceptance evidence must be a base64 `data:` URL \u2014 what a signature pad produces, or a scan read as one');
  }
  const contentType = (match[1] || 'application/octet-stream').toLowerCase();
  const data = Buffer.from(match[3].replace(/\s+/g, ''), 'base64');
  if (!data.length) throw new BadRequestException('the acceptance evidence is empty \u2014 there is nothing to file');
  if (data.length > EVIDENCE_MAX_BYTES) {
    throw new BadRequestException(`the acceptance evidence is ${Math.round(data.length / 1024)}KB; the limit is ${Math.round(EVIDENCE_MAX_BYTES / 1024)}KB`);
  }
  const subtype = contentType.split('/')[1] ?? 'bin';
  const extension = subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/g, '') || 'bin';
  return { data, contentType, extension };
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
    // The signature is a file like any other, so it goes where every other file goes: judged by
    // the file-type policy, governed by the document access engine, never into a business column.
    private readonly dms: DmsService,
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

  /**
   * Both defect authorities for a project, side by side (TC-GATE-9).
   *
   * Declared BEFORE `:id` so the fixed segment is not swallowed by the id route. Quality owns
   * snags, T&C owns punch items; this merges neither and Handover writes neither.
   */
  @Get('defects')
  defects(@Query('projectId') projectId?: string) {
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.service.readDefects(this.tenant.get().tenantId, projectId);
  }

  // ── Spares handed to the client (TC-GATE-16) ─────────────────────────────────────────────────
  //
  // Handover's own authority, and the last of the six readiness items to get one. The client's
  // acknowledgement is the only thing that satisfies readiness: our record of handing a part over is
  // our word, and the whole point of the field is that it is not ours.

  @Get('spares')
  listSpares(@Query('projectId') projectId?: string) {
    return this.service.listSpareItems(this.tenant.get().tenantId, projectId || undefined);
  }

  @Post('spares')
  addSpare(@Body() dto: {
    commissioningId?: string; description?: string; stockItemId?: string; unit?: string;
    quantityRequired?: number; required?: boolean; notes?: string;
  }) {
    if (!dto?.commissioningId) throw new BadRequestException('commissioningId is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    const ctx = this.tenant.get();
    return this.service.addSpareItem(ctx.tenantId, {
      commissioningId: dto.commissioningId,
      description: dto.description,
      stockItemId: dto.stockItemId ?? null,
      unit: dto.unit ?? null,
      quantityRequired: dto.quantityRequired,
      required: dto.required,
      notes: dto.notes ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Put('spares/:id/hand-over')
  handOverSpare(@Param('id') id: string, @Body() dto: { quantity?: number; notes?: string }) {
    if (typeof dto?.quantity !== 'number') throw new BadRequestException('quantity is required');
    const ctx = this.tenant.get();
    return this.service.handOverSpareItem(id, ctx.tenantId, {
      quantity: dto.quantity,
      handedOverBy: ctx.actorId,
      notes: dto.notes ?? null,
    });
  }

  @Put('spares/:id/acknowledge')
  acknowledgeSpare(@Param('id') id: string, @Body() dto: { acknowledgedBy?: string }) {
    if (!dto?.acknowledgedBy?.trim()) throw new BadRequestException('acknowledgedBy is required');
    return this.service.acknowledgeSpareItem(id, this.tenant.get().tenantId, { acknowledgedBy: dto.acknowledgedBy });
  }

  @Put('spares/:id/required')
  setSpareRequired(@Param('id') id: string, @Body() dto: { required?: boolean; notes?: string }) {
    if (typeof dto?.required !== 'boolean') throw new BadRequestException('required must be true or false');
    return this.service.setSpareItemRequired(id, this.tenant.get().tenantId, dto.required, dto.notes ?? null);
  }

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
  @Permissions('commissioning.handover.complete')
  completeTraining(@Param('id') id: string, @Body() dto: { attendees?: string; trainer?: string; demonstrationCompleted?: boolean; sessionDate?: string }) {
    if (!dto?.attendees?.trim()) throw new BadRequestException('attendees is required');
    const ctx = this.tenant.get();
    return this.service.completeTraining(id, ctx.tenantId, {
      attendees: dto.attendees,
      trainer: dto.trainer ?? null,
      demonstrationCompleted: dto.demonstrationCompleted,
      sessionDate: dto.sessionDate ?? null,
    }, ctx.actorId);
  }

  @Put('training/:id/acknowledge')
  acknowledgeTraining(@Param('id') id: string, @Body() dto: { acknowledgedBy?: string }) {
    if (!dto?.acknowledgedBy?.trim()) throw new BadRequestException('acknowledgedBy is required');
    return this.service.acknowledgeTraining(id, this.tenant.get().tenantId, { acknowledgedBy: dto.acknowledgedBy });
  }

  @Post()
  @Permissions('commissioning.handover.create')
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
  async get(@Param('id') id: string): Promise<HandoverView & { acceptanceEvidenceIntegrity?: 'verified' | 'mismatch' | 'unavailable' }> {
    const found = await this.service.get(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`handover package ${id} not found`);
    /**
     * THE CONTROLLED OUTPUT RESOLVES THE COMMITTED VERSION AND CHECKS IT.
     *
     * A record keeps the checksum it was handed when the act happened, and nothing compared the
     * two — so tamper-EVIDENCE existed and tamper-DETECTION did not. Replacing a version is now
     * refused outright, but a document store is shared infrastructure and a seal is a rule rather
     * than a law of physics; a sheet that prints a signature is the last place that can still
     * say "these are not the bytes that were signed".
     *
     * Three answers, rendered differently downstream: `verified`, `mismatch`, `unavailable`.
     */
    if (!found.acceptanceEvidenceDocumentId) return found;
    return {
      ...found,
      acceptanceEvidenceIntegrity: await this.dms.verifyCommittedChecksum(
        found.acceptanceEvidenceDocumentId,
        found.acceptanceEvidenceHash,
      ),
    };
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
  @Permissions('commissioning.handover.submit')
  submit(@Param('id') id: string): Promise<HandoverView> {
    const ctx = this.tenant.get();
    // The actor is stamped on the dossier manifest: "issued by" is part of what was sent.
    return this.service.submit(id, ctx.tenantId, ctx.actorId);
  }

  /**
   * CLIENT ACCEPTANCE — and the signature that makes it one.
   *
   * The screen has offered a "Client Representative Acceptance Signature" pad since this package
   * existed, wired to a handler that did nothing with the stroke. So the evidence of the act that
   * starts the warranty and defects-liability clock was a free-text name, typed by one of OUR
   * users, naming somebody on the client's side.
   *
   * The evidence is stored BEFORE the acceptance is recorded and the acceptance references it, so
   * a package never reaches `accepted` pointing at a document that was refused. If the acceptance
   * then fails its own guards — wrong status, or the submitter trying to accept their own
   * handover — an orphan signature document is left behind, which is the safe direction: a stored
   * file nothing references is inert, whereas a reference to nothing is a record that looks like
   * evidence.
   */
  @Put(':id/accept')
  @Permissions('commissioning.handover.accept')
  async accept(@Param('id') id: string, @Body() dto: AcceptDto): Promise<HandoverView> {
    if (!dto?.clientRepresentative?.trim()) throw new BadRequestException('clientRepresentative is required');
    const ctx = this.tenant.get();

    // 404 BEFORE ANYTHING IS STORED. Without this, a signature for a package that does not exist
    // would be written to storage and then thrown away by the service's own lookup.
    const pkg = await this.service.get(id, ctx.tenantId);
    if (!pkg) throw new NotFoundException(`handover package ${id} not found`);

    // THE METHOD AND ITS EVIDENCE ARRIVE TOGETHER OR NOT AT ALL, refused here before anything is
    // stored. A method with no document is a claim about proof that does not exist; a document
    // with no method is a file nobody can describe, and a certificate reading it would have to
    // guess whether somebody signed.
    const method = dto.acceptanceMethod;
    const supplied = dto.acceptanceEvidence?.trim();
    if (method && !supplied) {
      throw new BadRequestException(`an acceptance recorded as \`${method}\` must carry ${ACCEPTANCE_METHOD_EVIDENCE[method] ?? 'its evidence'}`);
    }
    if (supplied && !method) {
      throw new BadRequestException('acceptance evidence was supplied without saying what it is \u2014 name the acceptance method');
    }

    let evidence: { method: AcceptanceMethod; documentId: string; hash: string } | null = null;
    if (method && supplied) {
      const decoded = decodeDataUrl(supplied);
      const stored = await this.dms.createDocument(
        {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          /**
           * THE CATEGORY IS THE METHOD'S, so the file-type policy holds each to what it actually
           * is. A signature — drawn or scanned — is an image or a PDF and nothing else. An
           * emailed confirmation is CORRESPONDENCE, which may also be an office document or text,
           * because an exported message is not a signature and filing it as one would be the
           * first step towards printing it as one.
           */
          kind: method === 'email' ? 'correspondence' : 'signature',
          title: `Client acceptance (${method}) — ${pkg.code}`,
          aggregateType: 'commissioning.handover',
          aggregateId: id,
          createdBy: ctx.actorId ?? null,
        },
        { fileName: `acceptance-${method}-${pkg.code}.${decoded.extension}`, contentType: decoded.contentType, data: decoded.data },
      );
      // COMPUTED BY DMS, never taken from the caller — the same rule the site evidence route
      // follows. A hash supplied by whoever sent the image attests to nothing.
      //
      // A version with no checksum is refused rather than stored half-evidenced: the pair is what
      // makes this a record, and a reference nothing attests to would read as one without being
      // one. In practice storage always computes it; this is the branch that must never become a
      // silent `?? ''`.
      const checksum = stored.versions[0]?.checksum;
      if (!checksum) throw new BadRequestException('the evidence was stored without a checksum, so the acceptance cannot attest to it');
      evidence = { method, documentId: stored.document.id, hash: checksum };
    }

    return this.service.accept(id, ctx.tenantId, {
      clientRepresentative: dto.clientRepresentative,
      warrantyStartDate: dto.warrantyStartDate,
      warrantyMonths: dto.warrantyMonths,
      evidence,
    }, ctx.actorId);
  }

  @Put(':id/reject')
  @Permissions('commissioning.handover.reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto): Promise<HandoverView> {
    if (!dto?.reason?.trim()) throw new BadRequestException('reason is required');
    const ctx = this.tenant.get();
    return this.service.reject(id, ctx.tenantId, dto.reason, ctx.actorId);
  }
}
