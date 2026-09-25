import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { DmsService, Permissions, TenantContext } from '@aura/core';
import { parsePageParams, DISCIPLINES } from '@aura/shared';
import {
  type Ncr,
  type NcrVerification,
  type InspectionRequest,
  type Snag,
  type Itp,
  type NewItpPoint,
  type PointResult,
  type MaterialApproval,
  type MarDecision,
  type Calibration,
  type AuditSchedule,
  type ChecklistItem,
  type ChecklistPointInput,
  type ItpTemplate,
  QualityService,
} from '@aura/quality';

class RaiseNcrDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() ncrNumber!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() rootCause?: string;
  @IsString() severity!: Ncr['severity'];
  /**
   * Optional on purpose. Requiring it would reject every existing client and would push people to
   * pick a system they have not assessed; a null system reads as "not attributed", which the
   * Project 360 lens treats as project-wide and keeps visible under every filter.
   */
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsString() assignedTo?: string;
  /**
   * When the correction is due. Optional: an NCR nobody dated is a real one — it simply
   * cannot be overdue, and saying it is would invent a fact.
   */
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsString() sourceIrId?: string;
  @IsOptional() @IsString() sourceIrNumber?: string;
}

class PlanNcrDto {
  @IsString() rootCause!: string;
  @IsString() correctiveAction!: string;
  @IsOptional() @IsString() assignedTo?: string;
}

class VerifyNcrDto {
  @IsBoolean() accepted!: boolean;
  @IsOptional() @IsString() note?: string;
}

class RaiseNcrFromInspectionDto {
  @IsString() ncrNumber!: string;
  @IsString() description!: string;
  @IsString() severity!: Ncr['severity'];
  @IsOptional() @IsString() assignedTo?: string;
}

class RequestInspectionDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() irNumber!: string;
  @IsString() discipline!: InspectionRequest['discipline'];
  @IsString() locationDetail!: string;
  @IsString() inspectionDate!: string;
  @IsOptional() @IsString() boqItemId?: string | null;
  @IsOptional() @IsNumber() approvedQuantity?: number | null;
  @IsOptional() @IsString() unit?: string | null;
}

/**
 * A pad produces `data:image/png;base64,…`. Turn that into bytes we can store.
 *
 * The media type decides only the file name's extension and what we declare to storage; whether
 * the bytes may be kept under `signature` is decided by DmsService from the CONTENT, so a caller
 * relabelling a spreadsheet as `image/png` changes the extension and nothing that matters.
 */
const INSPECTION_SIGNATURE_MAX_BYTES = 1_200_000;
const INSPECTION_DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?(;charset=[a-z0-9-]+)?;base64,([a-z0-9+/=\s]+)$/i;

function decodeInspectionSignature(value: string): { data: Buffer; contentType: string; extension: string } {
  const match = INSPECTION_DATA_URL.exec((value ?? '').trim());
  if (!match) {
    throw new BadRequestException('the inspection signature must be a base64 `data:` URL, which is what a signature pad produces');
  }
  const contentType = (match[1] || 'application/octet-stream').toLowerCase();
  const data = Buffer.from(match[3].replace(/\s+/g, ''), 'base64');
  if (!data.length) throw new BadRequestException('the inspection signature is empty \u2014 nothing was drawn');
  if (data.length > INSPECTION_SIGNATURE_MAX_BYTES) {
    throw new BadRequestException(`the inspection signature is ${Math.round(data.length / 1024)}KB; the limit is ${Math.round(INSPECTION_SIGNATURE_MAX_BYTES / 1024)}KB`);
  }
  const subtype = contentType.split('/')[1] ?? 'bin';
  const extension = subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/g, '') || 'bin';
  return { data, contentType, extension };
}

class ResolveInspectionDto {
  @IsIn(['approved', 'rejected']) status!: 'approved' | 'rejected';
  @IsOptional() @IsString() comments?: string;
  /**
   * WHO SIGNED. A label — an inspection is witnessed by a consultant who holds no AURA account,
   * and `inspectedBy` on the record is already the internal user who resolved it. The two are
   * different people whenever the inspection is witnessed, and neither may stand in for the other.
   */
  @IsOptional() @IsString() signedBy?: string;
  /**
   * The signature itself, as the `data:` URL the pad produces. Travels with the decision because
   * that is the act it evidences; the API's JSON body limit is 2MB, so the decoded image is
   * capped below it with a message that explains itself.
   */
  @IsOptional() @IsString() signature?: string;
}

/** The multipart fields beside an inspection photograph. No `fileId`: this route creates it. */
class UploadInspectionEvidenceDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() capturedAt?: string;
}

/** The multipart fields beside NCR evidence. `stage` is which side of the NCR it evidences. */
class UploadNcrEvidenceDto {
  @IsOptional() @IsString() stage?: 'raised' | 'corrected';
  @IsOptional() @IsString() category?: 'photo' | 'signature' | 'other';
  @IsOptional() @IsString() description?: string;
  /** WHO SIGNED, for a signature. A label — a subcontractor's foreman holds no AURA account. */
  @IsOptional() @IsString() signedBy?: string;
}

class EscalateNcrDto {
  @IsString() reason!: string;
}

class LogSnagDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() description!: string;
  @IsString() locationDetail!: string;
  @IsString() severity!: Snag['severity'];
  @IsOptional() @IsString() assignedTo?: string;
}

@Controller('quality')
export class QualityController {
  constructor(
    private readonly qualityService: QualityService,
    private readonly tenant: TenantContext,
    // Quality's first file door. The bytes go where every other file goes: judged by the
    // file-type policy, governed by the document access engine, never into a business column.
    private readonly dms: DmsService,
  ) {}

  // ── NCR (Non-Conformance Reports) ──────────────────────────────────────────

  @Post('ncrs')
  raiseNcr(@Body() dto: RaiseNcrDto): Promise<Ncr> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.ncrNumber?.trim()) throw new BadRequestException('ncrNumber is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!dto?.severity?.trim()) throw new BadRequestException('severity is required');

    const validSeverities = ['minor', 'major'];
    if (!validSeverities.includes(dto.severity)) {
      throw new BadRequestException(`severity must be one of: ${validSeverities.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.qualityService.raiseNcr({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      ncrNumber: dto.ncrNumber,
      description: dto.description,
      rootCause: dto.rootCause,
      severity: dto.severity,
      system: dto.system,
      assignedTo: dto.assignedTo,
      sourceIrId: dto.sourceIrId,
      sourceIrNumber: dto.sourceIrNumber,
      dueAt: dto.dueAt,
      raisedBy: ctx.actorId || undefined,
    });
  }

  // ── NCR workflow commands (state machine; POST verbs, never PATCH status) ────

  @Post('ncrs/:id/plan')
  planNcrAction(@Param('id') id: string, @Body() dto: PlanNcrDto): Promise<Ncr> {
    if (!dto?.rootCause?.trim()) throw new BadRequestException('rootCause is required');
    if (!dto?.correctiveAction?.trim()) throw new BadRequestException('correctiveAction is required');
    const ctx = this.tenant.get();
    return this.qualityService.planNcrAction(ctx.tenantId, ctx.actorId, id, {
      rootCause: dto.rootCause,
      correctiveAction: dto.correctiveAction,
      assignedTo: dto.assignedTo,
    });
  }

  @Post('ncrs/:id/correct')
  markNcrCorrected(@Param('id') id: string): Promise<Ncr> {
    const ctx = this.tenant.get();
    return this.qualityService.markNcrCorrected(ctx.tenantId, ctx.actorId, id);
  }

  @Post('ncrs/:id/verify')
  verifyNcr(@Param('id') id: string, @Body() dto: VerifyNcrDto): Promise<Ncr> {
    if (typeof dto?.accepted !== 'boolean') throw new BadRequestException('accepted (boolean) is required');
    const ctx = this.tenant.get();
    return this.qualityService.verifyNcr(ctx.tenantId, ctx.actorId, id, { accepted: dto.accepted, note: dto.note });
  }

  @Get('ncrs/:id/verifications')
  listNcrVerifications(@Param('id') id: string): Promise<NcrVerification[]> {
    const ctx = this.tenant.get();
    return this.qualityService.listNcrVerifications(ctx.tenantId, id);
  }

  @Get('ncrs')
  listNcrs(@Query('projectId') projectId?: string): Promise<Ncr[]> {
    const ctx = this.tenant.get();
    return this.qualityService.listNcrs(ctx.tenantId, projectId);
  }

  @Get('ncrs/paged')
  pagedNcrs(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.qualityService.listNcrsPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
  }

  @Get('ncrs/:id')
  async getNcr(@Param('id') id: string): Promise<Ncr> {
    const ctx = this.tenant.get();
    const found = await this.qualityService.getNcr(ctx.tenantId, id);
    if (!found) throw new NotFoundException(`NCR ${id} not found`);
    return found;
  }

  // ── Inspection Requests (IR) ────────────────────────────────────────────────

  @Post('irs')
  requestInspection(@Body() dto: RequestInspectionDto): Promise<InspectionRequest> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.irNumber?.trim()) throw new BadRequestException('irNumber is required');
    if (!dto?.discipline?.trim()) throw new BadRequestException('discipline is required');
    if (!dto?.locationDetail?.trim()) throw new BadRequestException('locationDetail is required');
    if (!dto?.inspectionDate?.trim()) throw new BadRequestException('inspectionDate is required');

    // TC-GATE-12: validated against the canonical platform vocabulary, not a private four-value
    // list that could not describe an ELV system. Still REJECTED rather than silently coerced — an
    // unrecognised trade on a write somebody just made is a typo worth reporting, and the domain's
    // `toDiscipline` fallback is for reading rows that already exist.
    if (!(DISCIPLINES as readonly string[]).includes(dto.discipline)) {
      throw new BadRequestException(`discipline must be one of: ${DISCIPLINES.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.qualityService.requestInspection({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      irNumber: dto.irNumber,
      discipline: dto.discipline,
      locationDetail: dto.locationDetail,
      inspectionDate: dto.inspectionDate,
      inspectedBy: ctx.actorId || undefined,
      boqItemId: dto.boqItemId ?? null,
      approvedQuantity: dto.approvedQuantity ?? null,
      unit: dto.unit ?? null,
    });
  }

  @Post('irs/:id/start-inspection')
  startInspection(@Param('id') id: string): Promise<InspectionRequest> {
    const ctx = this.tenant.get();
    return this.qualityService.startInspection(ctx.tenantId, ctx.actorId, id);
  }

  /** Raise an NCR from a rejected (failed) inspection — carries the IR provenance onto the NCR. */
  @Post('irs/:id/raise-ncr')
  raiseNcrFromInspection(@Param('id') id: string, @Body() dto: RaiseNcrFromInspectionDto): Promise<Ncr> {
    if (!dto?.ncrNumber?.trim()) throw new BadRequestException('ncrNumber is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    const ctx = this.tenant.get();
    return this.qualityService.raiseNcrFromInspection(ctx.tenantId, ctx.actorId, id, {
      ncrNumber: dto.ncrNumber,
      description: dto.description,
      severity: dto.severity,
      assignedTo: dto.assignedTo,
    });
  }

  /**
   * RESOLVE AN INSPECTION — and keep the signature that decided it.
   *
   * The screen has offered an "Inspector / Witness Signature" pad since it existed, wired to
   * state the submit payload never read. So a passed inspection recorded a status and an actor
   * and nothing from whoever put their name to it.
   *
   * The signature is stored BEFORE the decision is recorded, so an inspection never reaches
   * `approved` citing a document the file-type policy refused. If the resolve then fails its own
   * guards — a terminal IR that cannot be re-resolved — an orphan document is left behind,
   * which is the safe direction: a stored file nothing references is inert, whereas a reference
   * to nothing is a record that looks like evidence.
   */
  @Put('irs/:id/resolve')
  async resolveInspection(
    @Param('id') id: string,
    @Body() dto: ResolveInspectionDto,
  ): Promise<InspectionRequest> {
    if (!dto?.status?.trim()) throw new BadRequestException('status is required');

    const validStatuses = ['approved', 'rejected'];
    if (!validStatuses.includes(dto.status)) {
      throw new BadRequestException(`status must be one of: ${validStatuses.join(', ')}`);
    }

    const ctx = this.tenant.get();

    // THE SIGNATURE AND ITS SIGNATORY MOVE TOGETHER. A signature with nobody's name on it would
    // fall back to the uploading account and the printed IR would resume reading "Signed by
    // <whoever pressed the button>"; a name with no signature is a claim about proof that does
    // not exist.
    const hasInk = Boolean(dto.signature?.trim());
    const hasName = Boolean(dto.signedBy?.trim());
    if (hasInk !== hasName) {
      throw new BadRequestException(
        hasInk
          ? 'name the person who signed this inspection \u2014 whoever records it is not therefore its signatory'
          : 'a signatory was named but no signature was supplied',
      );
    }

    let signature: { signedBy: string; fileId: string; hash: string } | null = null;
    if (hasInk && hasName) {
      const found = await this.qualityService.readInspection(ctx.tenantId, id);
      if (!found) throw new NotFoundException(`Inspection Request with ID ${id} not found`);
      const decoded = decodeInspectionSignature(dto.signature!);
      const stored = await this.dms.createDocument(
        {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          // Held to the `signature` allow-list — images and PDFs, judged from the magic bytes
          // and never from the declared type or the file name.
          kind: 'signature',
          title: `Inspection ${found.inspection.irNumber} \u2014 signed by ${dto.signedBy!.trim()}`,
          aggregateType: 'quality.inspection-request',
          aggregateId: id,
          createdBy: ctx.actorId ?? null,
        },
        {
          fileName: `inspection-signature-${found.inspection.irNumber}.${decoded.extension}`,
          contentType: decoded.contentType,
          data: decoded.data,
        },
      );
      // COMPUTED BY DMS, never taken from the caller: a hash supplied by whoever sent the image
      // attests to nothing.
      const checksum = stored.versions[0]?.checksum;
      if (!checksum) throw new BadRequestException('the signature was stored without a checksum, so the inspection cannot attest to it');
      signature = { signedBy: dto.signedBy!.trim(), fileId: stored.document.id, hash: checksum };
    }

    return this.qualityService.resolveInspection(
      ctx.tenantId,
      ctx.actorId,
      id,
      dto.status,
      dto.comments,
      signature,
    );
  }

  /**
   * THE DOOR QUALITY DID NOT HAVE.
   *
   * Every multipart upload route in AURA was in CRM, Tendering, DocControl and Site. Quality had
   * none, so an inspection request — the record that says a thing was looked at and passed —
   * could carry no photograph of what was looked at.
   *
   * Upload and attach are ONE act, as in site: two calls would allow a stored photo attached to
   * nothing, and an evidence row pointing at a file that was never stored.
   *
   * THE PERMISSION IS DECLARED, not derived. The derived name for this path would be
   * `quality.ir.upload`, which no role holds — the route would exist, look governed, and be
   * reachable by nobody. `quality.ir.resolve` is the authority that decides the inspection, and
   * whoever decides it attaches its evidence.
   */
  @Post('irs/:id/evidence/upload')
  @Permissions('quality.ir.resolve')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async uploadInspectionEvidence(
    @Param('id') id: string,
    @Body() dto: UploadInspectionEvidenceDto,
    @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('a file is required');
    const ctx = this.tenant.get();
    const found = await this.qualityService.readInspection(ctx.tenantId, id);
    if (!found) throw new NotFoundException(`Inspection Request with ID ${id} not found`);

    const stored = await this.dms.createDocument(
      {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        // `evidence` holds images and PDFs: what a phone or a scanner produced on an inspection,
        // never a spreadsheet or an archive.
        kind: 'evidence',
        title: dto?.description?.trim() || file.originalname,
        aggregateType: 'quality.inspection-request',
        aggregateId: id,
        createdBy: ctx.actorId ?? null,
      },
      {
        fileName: file.originalname.split(/[\\/]/).pop() || 'evidence',
        contentType: file.mimetype || 'application/octet-stream',
        data: file.buffer,
      },
    );

    return this.qualityService.addInspectionEvidence(ctx.tenantId, ctx.actorId, id, {
      fileId: stored.document.id,
      description: dto?.description,
      location: dto?.location,
      capturedAt: dto?.capturedAt,
      // COMPUTED HERE, never accepted from the caller. The hash is the tamper-evidence on the
      // photograph; one supplied by whoever uploaded the file attests to nothing.
      hash: stored.versions[0].checksum,
    });
  }

  /**
   * EVIDENCE FOR AN NCR, on whichever side of it the file belongs to.
   *
   * The screen has shown a "QA / Inspector Sign-off" pad since it existed, bound to React state
   * the submit payload never read, and there was no attachment route at all — so a
   * non-conformance could carry no photograph of the thing that was wrong.
   *
   * THE PERMISSION IS DECLARED: the derived name would be `quality.ncr.evidence`, which no role
   * holds. `quality.ncr.correct` is the authority that works the NCR, and evidencing it belongs
   * with that.
   */
  @Post('ncrs/:id/evidence/upload')
  @Permissions('quality.ncr.correct')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async uploadNcrEvidence(
    @Param('id') id: string,
    @Body() dto: UploadNcrEvidenceDto,
    @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('a file is required');
    const ctx = this.tenant.get();
    const found = await this.qualityService.readNcr(ctx.tenantId, id);
    if (!found) throw new NotFoundException(`NCR with ID ${id} not found`);

    const isSignature = dto?.category === 'signature';
    const stored = await this.dms.createDocument(
      {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        kind: isSignature ? 'signature' : 'evidence',
        title: dto?.description?.trim() || file.originalname,
        aggregateType: 'quality.ncr',
        aggregateId: id,
        createdBy: ctx.actorId ?? null,
      },
      {
        fileName: file.originalname.split(/[\\/]/).pop() || 'evidence',
        contentType: file.mimetype || 'application/octet-stream',
        data: file.buffer,
      },
    );

    return this.qualityService.addNcrEvidence(ctx.tenantId, ctx.actorId, id, {
      fileId: stored.document.id,
      stage: dto?.stage,
      category: dto?.category,
      description: dto?.description,
      signedBy: dto?.signedBy,
      // COMPUTED HERE, never accepted from the caller.
      hash: stored.versions[0].checksum,
    });
  }

  /**
   * ESCALATE AN OVERDUE CORRECTION. The domain refuses one that is not actually late.
   */
  @Post('ncrs/:id/escalate')
  @Permissions('quality.ncr.verify')
  escalateNcr(@Param('id') id: string, @Body() dto: EscalateNcrDto) {
    if (!dto?.reason?.trim()) throw new BadRequestException('a reason is required to escalate an NCR');
    const ctx = this.tenant.get();
    return this.qualityService.escalateNcr(ctx.tenantId, ctx.actorId, id, dto.reason);
  }

  /** The NCR with its evidence, which half is evidenced, and whether it is late. */
  @Get('ncrs/:id/detail')
  async ncrDetail(@Param('id') id: string) {
    const found = await this.qualityService.readNcr(this.tenant.get().tenantId, id);
    if (!found) throw new NotFoundException(`NCR with ID ${id} not found`);
    /**
     * EVERY SIGNATURE IS CHECKED AGAINST THE BYTES IT WAS COMMITTED WITH, as the inspection
     * request's does. An NCR can hold TWO — the foreman shown the defect and whoever signed off
     * the repair — and they are checked independently, because one sound signature says nothing
     * about the other.
     */
    const evidence = await Promise.all(
      found.evidence.map(async (e) =>
        e.category === 'signature'
          ? { ...e, integrity: await this.dms.verifyCommittedChecksum(e.fileId, e.hash) }
          : e,
      ),
    );
    return { ...found, evidence };
  }

  /** The inspection with its photographs and its signature, the signature already judged. */
  @Get('irs/:id/detail')
  async inspectionDetail(@Param('id') id: string) {
    const found = await this.qualityService.readInspection(this.tenant.get().tenantId, id);
    if (!found) throw new NotFoundException(`Inspection Request with ID ${id} not found`);
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
    const signature = found.signature
      ? { ...found.signature, integrity: await this.dms.verifyCommittedChecksum(found.signature.fileId, found.signature.hash) }
      : null;
    return { ...found, signature };
  }

  @Get('irs')
  listInspections(@Query('projectId') projectId?: string): Promise<InspectionRequest[]> {
    const ctx = this.tenant.get();
    return this.qualityService.listInspections(ctx.tenantId, projectId);
  }

  @Get('irs/paged')
  pagedInspections(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.qualityService.listInspectionsPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
  }

  // ── Snagging / Punch List ──────────────────────────────────────────────────

  @Post('snags')
  @Permissions('quality.snag.create')
  logSnag(@Body() dto: LogSnagDto): Promise<Snag> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!dto?.locationDetail?.trim()) throw new BadRequestException('locationDetail is required');
    if (!dto?.severity?.trim()) throw new BadRequestException('severity is required');

    const validSeverities = ['low', 'medium', 'high'];
    if (!validSeverities.includes(dto.severity)) {
      throw new BadRequestException(`severity must be one of: ${validSeverities.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.qualityService.logSnag({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      description: dto.description,
      locationDetail: dto.locationDetail,
      severity: dto.severity,
      assignedTo: dto.assignedTo,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Put('snags/:id/resolve')
  @Permissions('quality.snag.resolve')
  resolveSnag(@Param('id') id: string): Promise<Snag> {
    const ctx = this.tenant.get();
    return this.qualityService.resolveSnag(ctx.tenantId, ctx.actorId, id, 'resolved');
  }

  // CLOSING IS NOT RESOLVING. Claiming a fix and accepting one are different judgements, and the
  // service used to assert `quality.snag.resolve` for both while the guard derived
  // `quality.snag.close` from this path that nothing asserted.
  @Put('snags/:id/close')
  @Permissions('quality.snag.close')
  closeSnag(@Param('id') id: string): Promise<Snag> {
    const ctx = this.tenant.get();
    return this.qualityService.resolveSnag(ctx.tenantId, ctx.actorId, id, 'closed');
  }

  @Get('snags')
  listSnags(@Query('projectId') projectId?: string): Promise<Snag[]> {
    const ctx = this.tenant.get();
    return this.qualityService.listSnags(ctx.tenantId, projectId);
  }

  @Get('snags/paged')
  pagedSnags(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.qualityService.listSnagsPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
  }

  // ── Inspection & Test Plans (ITP) ──────────────────────────────────────────

  @Post('itps')
  @Permissions('quality.itp.create')
  async createItp(@Body() dto: { projectId: string; projectName?: string; reference: string; title: string; discipline?: string; points: NewItpPoint[] }): Promise<Itp> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.reference?.trim()) throw new BadRequestException('reference is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!Array.isArray(dto?.points) || dto.points.length === 0) throw new BadRequestException('at least one inspection point is required');
    const ctx = this.tenant.get();
    return await this.qualityService.createItp({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      projectId: dto.projectId,
      projectName: dto.projectName,
      reference: dto.reference,
      title: dto.title,
      discipline: dto.discipline,
      points: dto.points,
      createdBy: ctx.actorId || null,
    });
  }

  /**
   * Narrowed to `?projectId=` when one is given. The guard authorises a project member FOR that
   * project, and the handler used to ignore it and answer with every plan in the tenant — so a
   * member of one project read every other project's ITPs, and a project's checklist screen showed
   * another project's approved revision as its own.
   */
  @Get('itps')
  listItps(@Query('projectId') projectId?: string): Promise<Itp[]> {
    return this.qualityService.listItps(this.tenant.get().tenantId, projectId || undefined);
  }

  @Get('itps/paged')
  pagedItps(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.qualityService.listItpsPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
  }

  @Put('itps/:id/activate')
  @Permissions('quality.itp.activate')
  async activateItp(@Param('id') id: string): Promise<Itp> {
    const ctx = this.tenant.get();
    return await this.qualityService.activateItp(ctx.tenantId, ctx.actorId, id);
  }

  @Put('itps/:id/points/:index')
  async recordItpPoint(@Param('id') id: string, @Param('index') index: string, @Body() dto: { result: PointResult }): Promise<Itp> {
    if (dto?.result !== 'passed' && dto?.result !== 'failed') throw new BadRequestException("result must be 'passed' or 'failed'");
    return await this.qualityService.recordItpPoint(this.tenant.get().tenantId, id, Number(index), dto.result);
  }

  @Put('itps/:id/close')
  @Permissions('quality.itp.close')
  async closeItp(@Param('id') id: string): Promise<Itp> {
    const ctx = this.tenant.get();
    return await this.qualityService.closeItp(ctx.tenantId, ctx.actorId, id);
  }

  // ── The approved system checklist (TC-08 / TC-09) ───────────────────────────
  //
  // Quality owns every act below: the tenant library, adopting a template into a project, adapting
  // it, and the approval — by a QA/QC person other than the preparer. T&C reads them and executes the
  // approved points on the commissioning record bound to the revision; it writes none of this.

  @Get('itp-templates/coverage')
  @Permissions('quality.itp-template.read')
  templateCoverage() {
    return this.qualityService.itpTemplateCoverage(this.tenant.get().tenantId);
  }

  @Get('itp-templates')
  @Permissions('quality.itp-template.read')
  listTemplates(@Query('system') system?: string): Promise<ItpTemplate[]> {
    return this.qualityService.listItpTemplates(this.tenant.get().tenantId, system || undefined);
  }

  @Get('itp-templates/:id')
  @Permissions('quality.itp-template.read')
  async getTemplate(@Param('id') id: string): Promise<ItpTemplate> {
    const t = await this.qualityService.getItpTemplate(this.tenant.get().tenantId, id);
    if (!t) throw new NotFoundException(`ITP template ${id} not found`);
    return t;
  }

  @Post('itp-templates')
  @Permissions('quality.itp-template.manage')
  createTemplate(@Body() dto: { system: string; title: string; points: ChecklistPointInput[] }): Promise<ItpTemplate> {
    const ctx = this.tenant.get();
    return this.qualityService.createItpTemplate({
      tenantId: ctx.tenantId, companyId: ctx.companyId || null, actorId: ctx.actorId || null,
      system: dto?.system, title: dto?.title, points: dto?.points,
    });
  }

  @Put('itp-templates/:id')
  @Permissions('quality.itp-template.manage')
  editTemplate(@Param('id') id: string, @Body() dto: { title?: string; points?: ChecklistPointInput[] }): Promise<ItpTemplate> {
    const ctx = this.tenant.get();
    return this.qualityService.editItpTemplate(ctx.tenantId, ctx.actorId || null, id, { title: dto?.title, points: dto?.points });
  }

  @Post('itp-templates/:id/publish')
  @Permissions('quality.itp-template.manage')
  publishTemplate(@Param('id') id: string): Promise<ItpTemplate> {
    const ctx = this.tenant.get();
    return this.qualityService.publishItpTemplate(ctx.tenantId, ctx.actorId || null, id);
  }

  @Post('itp-templates/:id/retire')
  @Permissions('quality.itp-template.manage')
  retireTemplate(@Param('id') id: string): Promise<ItpTemplate> {
    const ctx = this.tenant.get();
    return this.qualityService.retireItpTemplate(ctx.tenantId, ctx.actorId || null, id);
  }

  /** Adopt a published template into a project as the next revision of that system's checklist. */
  @Post('itps/system')
  @Permissions('quality.itp.create')
  prepareSystemItp(@Body() dto: { projectId: string; projectName?: string; templateId: string; reference?: string }): Promise<Itp> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.templateId) throw new BadRequestException('templateId is required');
    const ctx = this.tenant.get();
    return this.qualityService.prepareSystemItp({
      tenantId: ctx.tenantId, companyId: ctx.companyId || null, actorId: ctx.actorId || null,
      projectId: dto.projectId, projectName: dto.projectName ?? null, templateId: dto.templateId, reference: dto.reference,
    });
  }

  @Get('itps/:id')
  @Permissions('quality.itp.read')
  async getItp(@Param('id') id: string): Promise<Itp> {
    const itp = await this.qualityService.getItp(this.tenant.get().tenantId, id);
    if (!itp) throw new NotFoundException(`ITP ${id} not found`);
    return itp;
  }

  @Put('itps/:id/checklist')
  @Permissions('quality.itp.create')
  editSystemItp(@Param('id') id: string, @Body() dto: { title?: string; points?: ChecklistPointInput[] }): Promise<Itp> {
    const ctx = this.tenant.get();
    return this.qualityService.editSystemItp(ctx.tenantId, ctx.actorId || null, id, { title: dto?.title, points: dto?.points });
  }

  @Post('itps/:id/submit')
  @Permissions('quality.itp.create')
  submitSystemItp(@Param('id') id: string): Promise<Itp> {
    const ctx = this.tenant.get();
    return this.qualityService.submitSystemItp(ctx.tenantId, ctx.actorId || null, id);
  }

  @Post('itps/:id/approve')
  @Permissions('quality.itp.approve')
  approveSystemItp(@Param('id') id: string): Promise<Itp> {
    const ctx = this.tenant.get();
    return this.qualityService.approveSystemItp(ctx.tenantId, ctx.actorId || null, id);
  }

  @Post('itps/:id/return')
  @Permissions('quality.itp.approve')
  returnSystemItp(@Param('id') id: string, @Body() dto: { reason?: string }): Promise<Itp> {
    const ctx = this.tenant.get();
    return this.qualityService.returnSystemItp(ctx.tenantId, ctx.actorId || null, id, dto?.reason);
  }

  @Post('itps/:id/revise')
  @Permissions('quality.itp.create')
  reviseSystemItp(@Param('id') id: string, @Body() dto: { reference?: string }): Promise<Itp> {
    const ctx = this.tenant.get();
    return this.qualityService.reviseSystemItp(ctx.tenantId, ctx.actorId || null, id, dto?.reference);
  }

  // ── Material Approval Requests (MAR) ───────────────────────────────────────

  // EXPLICIT for the reason ENG-03 exposed: route derivation and any service-side assert must
  // agree on ONE word, or a role holding the one it names is refused by the other.
  @Permissions('quality.material-approval.create')
  @Post('material-approvals')
  async createMar(@Body() dto: { projectId: string; projectName?: string; reference: string; materialName: string; manufacturer?: string; supplier?: string; supplierId?: string; specification?: string; discipline?: string }): Promise<MaterialApproval> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.reference?.trim()) throw new BadRequestException('reference is required');
    if (!dto?.materialName?.trim()) throw new BadRequestException('materialName is required');
    const ctx = this.tenant.get();
    return await this.qualityService.createMaterialApproval({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      projectId: dto.projectId,
      projectName: dto.projectName,
      reference: dto.reference,
      materialName: dto.materialName,
      manufacturer: dto.manufacturer,
      supplier: dto.supplier,
      // The canonical supplier, so the procurement gate is not matching on typed names.
      supplierId: dto.supplierId ?? null,
      specification: dto.specification,
      discipline: dto.discipline,
      createdBy: ctx.actorId || null,
    });
  }

  @Permissions('quality.material-approval.read')
  @Get('material-approvals')
  listMars(): Promise<MaterialApproval[]> {
    return this.qualityService.listMaterialApprovals(this.tenant.get().tenantId);
  }

  @Get('material-approvals/paged')
  pagedMars(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
  ) {
    return this.qualityService.listMaterialApprovalsPaged(
      { tenantId: this.tenant.get().tenantId, projectId, status },
      parsePageParams(limit, offset),
    );
  }

  @Permissions('quality.material-approval.submit')
  @Put('material-approvals/:id/submit')
  async submitMar(@Param('id') id: string): Promise<MaterialApproval> {
    return await this.qualityService.submitMaterialApproval(this.tenant.get().tenantId, id);
  }

  // THE DECISION. A different permission from raising it: the engineer who proposed the product
  // must not be the one who approves it.
  @Permissions('quality.material-approval.review')
  @Put('material-approvals/:id/review')
  async reviewMar(@Param('id') id: string, @Body() dto: { decision: MarDecision; comments?: string }): Promise<MaterialApproval> {
    const ctx = this.tenant.get();
    return await this.qualityService.reviewMaterialApproval(ctx.tenantId, id, dto?.decision, ctx.actorId || null, dto?.comments);
  }

  @Permissions('quality.material-approval.revise')
  @Put('material-approvals/:id/revise')
  async reviseMar(@Param('id') id: string): Promise<MaterialApproval> {
    return await this.qualityService.reviseMaterialApproval(this.tenant.get().tenantId, id);
  }

  // ── Equipment calibration ──────────────────────────────────────────────────

  @Post('calibrations')
  async recordCalibration(
    @Body() dto: { projectId?: string; projectName?: string; equipmentName: string; equipmentSerial: string; instrumentType?: string; calibrationDate: string; dueDate: string; certificateNumber?: string; calibratedBy?: string; notes?: string },
  ): Promise<Calibration> {
    if (!dto?.equipmentName?.trim()) throw new BadRequestException('equipmentName is required');
    if (!dto?.equipmentSerial?.trim()) throw new BadRequestException('equipmentSerial is required');
    if (!dto?.calibrationDate || !dto?.dueDate) throw new BadRequestException('calibrationDate and dueDate are required');
    const ctx = this.tenant.get();
    return await this.qualityService.recordCalibration({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId ?? null,
      projectName: dto.projectName ?? null,
      equipmentName: dto.equipmentName,
      equipmentSerial: dto.equipmentSerial,
      instrumentType: dto.instrumentType ?? null,
      calibrationDate: dto.calibrationDate,
      dueDate: dto.dueDate,
      certificateNumber: dto.certificateNumber ?? null,
      calibratedBy: dto.calibratedBy ?? null,
      notes: dto.notes ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Get('calibrations')
  listCalibrations(): Promise<Calibration[]> {
    return this.qualityService.listCalibrations(this.tenant.get().tenantId);
  }

  @Get('calibrations/:id')
  async getCalibration(@Param('id') id: string): Promise<Calibration> {
    const found = await this.qualityService.getCalibration(this.tenant.get().tenantId, id);
    if (!found) throw new BadRequestException(`calibration ${id} not found`);
    return found;
  }

  // ── ISO Checklists & Audits ───────────────────────────────────────────────

  @Post('audits')
  async scheduleAudit(
    @Body()
    dto: {
      projectId: string;
      projectName?: string;
      auditNumber: string;
      auditType: string;
      scheduledDate: string;
      auditorName: string;
      checklist?: ChecklistItem[];
    },
  ): Promise<AuditSchedule> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.auditNumber?.trim()) throw new BadRequestException('auditNumber is required');
    if (!dto?.auditType?.trim()) throw new BadRequestException('auditType is required');
    if (!dto?.scheduledDate) throw new BadRequestException('scheduledDate is required');
    if (!dto?.auditorName?.trim()) throw new BadRequestException('auditorName is required');

    const ctx = this.tenant.get();
    return await this.qualityService.scheduleAudit(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName,
      auditNumber: dto.auditNumber,
      auditType: dto.auditType,
      scheduledDate: dto.scheduledDate,
      auditorName: dto.auditorName,
      checklist: dto.checklist,
    });
  }

  @Get('audits')
  listAudits(@Query('projectId') projectId?: string): Promise<AuditSchedule[]> {
    return this.qualityService.listAudits(this.tenant.get().tenantId, projectId);
  }

  @Get('audits/:id')
  async getAudit(@Param('id') id: string): Promise<AuditSchedule> {
    const found = await this.qualityService.getAudit(this.tenant.get().tenantId, id);
    if (!found) throw new BadRequestException(`audit ${id} not found`);
    return found;
  }

  @Put('audits/:id/checklist')
  async updateAuditChecklist(
    @Param('id') id: string,
    @Body() dto: { checklist: ChecklistItem[]; status?: AuditSchedule['status'] },
  ): Promise<AuditSchedule> {
    if (!Array.isArray(dto?.checklist)) throw new BadRequestException('checklist must be an array');
    return await this.qualityService.updateAuditChecklist(
      this.tenant.get().tenantId,
      id,
      dto.checklist,
      dto.status,
    );
  }

  @Post('audits/:id/checklist/:itemIndex/ncr')
  async generateNcrFromFailedCheck(
    @Param('id') id: string,
    @Param('itemIndex') itemIndex: string,
  ): Promise<Ncr> {
    const ctx = this.tenant.get();
    return await this.qualityService.generateNcrFromFailedCheck(
      ctx.tenantId,
      ctx.actorId,
      id,
      Number(itemIndex),
    );
  }
}
