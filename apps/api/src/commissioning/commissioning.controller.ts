import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DmsService, Permissions, TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type CommissioningRecord,
  type CommissioningTestItem,
  type CommissioningTestRun,
  type PunchItem,
  type PunchSeverity,
  type ElvSystem,
  type AttachmentCategory,
  type SignatoryAuthority,
  type SignoffMethod,
  type SignoffParty,
  ATTACHMENT_CATEGORIES,
  SIGNATORY_AUTHORITIES,
  ACCEPTANCE_METHODS,
  SIGNOFF_PARTIES,
  CommissioningService,
} from '@aura/commissioning';

class RegisterDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() system?: ElvSystem;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsInt() @Min(0) pointsTotal?: number;
  /** The approved system-ITP revision to create the record FROM — its points arrive with it. */
  @IsOptional() @IsString() itpId?: string;
}

class BindChecklistDto {
  @IsString() itpId!: string;
}

class TestDto {
  @IsInt() @Min(0) pointsPassed!: number;
  @IsOptional() @IsInt() @Min(0) pointsTotal?: number;
  @IsOptional() @IsString() testDate?: string;
  @IsOptional() @IsString() remarks?: string;
}

/** One party's signature, as the `data:` URL a pad or a scan produces. */
/**
 * A pad produces `data:image/png;base64,…` and a scan read in the browser produces the same
 * shape. Turn either into bytes we can store.
 *
 * The media type here decides the file name's extension and what we declare to storage. Whether
 * the bytes may be kept under the chosen category is decided by DmsService from the CONTENT, so a
 * caller relabelling a spreadsheet as `image/png` changes the extension and nothing that matters.
 *
 * Capped below the API's own 2MB JSON body limit, and a sign-off may carry two of these, so each
 * one gets half the room — refused by a message that explains itself rather than dying in the
 * body parser.
 */
const SIGNOFF_EVIDENCE_MAX_BYTES = 600_000;
const SIGNOFF_DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?(;charset=[a-z0-9-]+)?;base64,([a-z0-9+/=\s]+)$/i;

function decodeSignoffEvidence(value: string): { data: Buffer; contentType: string; extension: string } {
  const match = SIGNOFF_DATA_URL.exec((value ?? '').trim());
  if (!match) {
    throw new BadRequestException('sign-off evidence must be a base64 `data:` URL \u2014 what a signature pad produces, or a scan read as one');
  }
  const contentType = (match[1] || 'application/octet-stream').toLowerCase();
  const data = Buffer.from(match[3].replace(/\s+/g, ''), 'base64');
  if (!data.length) throw new BadRequestException('the sign-off evidence is empty \u2014 there is nothing to file');
  if (data.length > SIGNOFF_EVIDENCE_MAX_BYTES) {
    throw new BadRequestException(`the sign-off evidence is ${Math.round(data.length / 1024)}KB; the limit is ${Math.round(SIGNOFF_EVIDENCE_MAX_BYTES / 1024)}KB per signature`);
  }
  const subtype = contentType.split('/')[1] ?? 'bin';
  const extension = subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/g, '') || 'bin';
  return { data, contentType, extension };
}

/** One party's signature, as the `data:` URL a pad or a scan produces. */
class SignoffEvidenceDto {
  @IsString() party!: SignoffParty;
  /** WHO SIGNED. A label — a consultant's witness holds no AURA account. */
  @IsString() signedBy!: string;
  @IsString() method!: SignoffMethod;
  /**
   * WHOSE witness they were: contractor, consultant, client or authority. `party` says which side
   * signed; this says whose standing it was, and TC-06 asks for both. Required for a witness; the
   * engineer signs for the contractor by definition and the domain defaults it.
   */
  @IsOptional() @IsString() authority?: SignatoryAuthority;
  @IsString() evidence!: string;
}

/** The multipart fields beside a test attachment. No `fileId`: this route creates it. */
class UploadAttachmentDto {
  @IsOptional() @IsString() category?: AttachmentCategory;
  @IsOptional() @IsString() description?: string;
}

class CommissionDto {
  @IsString() commissionedBy!: string;
  @IsString() witnessedBy!: string;
  /**
   * The signatures for this sign-off, at most one per party.
   *
   * Part of the SAME request, because a sign-off that could be recorded first and evidenced
   * afterwards would let a system be commissioned on nobody's signature and have one attached
   * later by somebody else. Absent means a sign-off with no signature on file — a real record,
   * which the evidence pack then describes as exactly that rather than printing a ruled line
   * under a note claiming the sign-off was witnessed.
   */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SignoffEvidenceDto)
  signoffEvidence?: SignoffEvidenceDto[];
}

class FailDto {
  @IsString() reason!: string;
}

class TestItemDto {
  @IsString() pointNo!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() expected?: string;
}
class TestResultDto {
  @IsString() result!: 'pass' | 'fail';
  @IsOptional() @IsString() actual?: string;
  @IsOptional() @IsString() remarks?: string;
}
class PunchDto {
  @IsString() description!: string;
  @IsOptional() @IsString() severity?: PunchSeverity;
  @IsOptional() @IsString() location?: string;
  /** Provenance into the test evidence that found the defect (both optional — see the service). */
  @IsOptional() @IsString() testItemId?: string;
  @IsOptional() @IsString() sourceRunId?: string;
}
class ClosePunchDto {
  @IsString() resolution!: string;
}
class EscalateDto {
  /** The Quality NCR a person raised for this defect. A reference — T&C never creates one. */
  @IsOptional() @IsString() qualityNcrId?: string;
}
class LinkItpDto {
  @IsString() itpId!: string;
  @IsOptional() @IsInt() @Min(0) pointIndex?: number;
  @IsOptional() @IsString() testItemId?: string;
}

/**
 * Commissioning (Test & Commission) API — the ELV deliverable register. Register a system,
 * record its test pass/total, then commission it with a witnessed sign-off (the event that
 * unlocks handover). Domain guards throw plain Errors classified by the global taxonomy
 * (404 not-found, 409 already/only-can, 400 required) — no 500 leaks.
 */
@Controller('commissioning/records')
export class CommissioningController {
  constructor(
    private readonly service: CommissioningService,
    private readonly tenant: TenantContext,
    // A signature is a file like any other, so it goes where every other file goes: judged by the
    // file-type policy, governed by the document access engine, never into a business column.
    private readonly dms: DmsService,
  ) {}

  @Post()
  register(@Body() dto: RegisterDto): Promise<CommissioningRecord> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.service.register({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName ?? null,
      code: dto.code,
      title: dto.title,
      system: dto.system,
      location: dto.location ?? null,
      pointsTotal: dto.pointsTotal,
      createdBy: ctx.actorId,
      itpId: dto.itpId || null,
    });
  }

  /**
   * CHECKLIST COVERAGE (TC-08/TC-09): per system on the project, Quality's published template, the
   * approved revision, and whether each record is bound. Declared BEFORE `:id`.
   */
  @Get('checklist-coverage')
  checklistCoverage(@Query('projectId') projectId?: string) {
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.service.checklistCoverage(this.tenant.get().tenantId, projectId);
  }

  @Get()
  list(@Query('projectId') projectId?: string): Promise<CommissioningRecord[]> {
    return this.service.list(this.tenant.get().tenantId, projectId);
  }

  @Get('paged')
  paged(
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.listPaged(this.tenant.get().tenantId, parsePageParams(limit, offset), projectId);
  }

  /**
   * The T&C workspace read model: every system in commissioning scope with its derived standing and
   * the blockers between it and sign-off. Declared BEFORE `:id` so the literal segment is not
   * swallowed by the parameter route.
   */
  @Get('workspace')
  workspace(@Query('projectId') projectId?: string) {
    return this.service.readWorkspace(this.tenant.get().tenantId, projectId || undefined);
  }

  /** Every defect on the project, with its provenance into the test evidence. */
  @Get('punch-items')
  projectPunch(@Query('projectId') projectId?: string): Promise<PunchItem[]> {
    return this.service.listProjectPunchItems(this.tenant.get().tenantId, projectId || undefined);
  }

  /**
   * The project's Quality evidence, as T&C reads it: the ITPs a person can link to a system, and the
   * non-conformances that block one. Read-only, and `null` when Quality cannot be read — the UI says
   * so rather than showing an empty list that looks like "all clear".
   */
  @Get('quality-evidence')
  qualityEvidence(@Query('projectId') projectId?: string) {
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.service.readQualityEvidence(this.tenant.get().tenantId, projectId);
  }

  /** The project's device schedule, read from the ELV register, which owns it. */
  @Get('equipment')
  equipment(@Query('projectId') projectId?: string) {
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.service.readEquipment(this.tenant.get().tenantId, projectId);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<CommissioningRecord> {
    const found = await this.service.get(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`commissioning record ${id} not found`);
    return found;
  }

  @Put(':id/test')
  recordTest(@Param('id') id: string, @Body() dto: TestDto): Promise<CommissioningRecord> {
    if (dto?.pointsPassed == null) throw new BadRequestException('pointsPassed is required');
    return this.service.recordTest(id, this.tenant.get().tenantId, {
      pointsPassed: dto.pointsPassed,
      pointsTotal: dto.pointsTotal,
      testDate: dto.testDate ?? null,
      remarks: dto.remarks ?? null,
    });
  }

  /**
   * WITNESSED SIGN-OFF — and the evidence that makes it witnessed.
   *
   * `commissionedBy` and `witnessedBy` have been required here since the record existed, and both
   * are free text typed by whoever was at the keyboard. The evidence pack printed two blank ruled
   * lines beneath a note describing "the witnessed sign-off", so the document asserted a
   * witnessed sign-off and held nothing whatsoever from the witness.
   *
   * Each party's signature is stored BEFORE the sign-off is recorded, so a record never reaches
   * `commissioned` citing a document that was refused. If the sign-off then fails its own guards
   * — an open punch item, a point that never passed — an orphan document is left behind, which
   * is the safe direction: a stored file nothing references is inert, whereas a reference to
   * nothing is a record that looks like evidence.
   */
  /**
   * THE DOOR COMMISSIONING DID NOT HAVE.
   *
   * Every multipart upload route in AURA was in CRM, Tendering, DocControl, Site and Quality.
   * Commissioning had none, so a witnessed test could carry no instrument printout, no photograph
   * of the installed device and no calibration certificate — the evidence a test actually
   * produces had nowhere to go, which is the half of TC-07 the signature did not cover.
   *
   * Upload and attach are ONE act, as everywhere else: two calls would allow a stored file
   * attached to nothing, and an attachment row pointing at a file that was never stored.
   *
   * THE PERMISSION IS DECLARED, not derived. The derived name would be
   * `commissioning.record.attachments`, which no role holds — the route would exist, look
   * governed and be reachable by nobody, which is the shape SIT-04 found in site.
   * `commissioning.record.test` is the authority that records what a test produced, and attaching
   * its evidence belongs with it.
   */
  @Post(':id/attachments')
  @Permissions('commissioning.record.test')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async uploadAttachment(
    @Param('id') id: string,
    @Body() dto: UploadAttachmentDto,
    @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('a file is required');
    const category = dto?.category ?? 'photo';
    if (!ATTACHMENT_CATEGORIES.includes(category)) {
      throw new BadRequestException(`an attachment category must be one of ${ATTACHMENT_CATEGORIES.join(', ')}`);
    }
    const ctx = this.tenant.get();
    const rec = await this.service.get(id, ctx.tenantId);
    if (!rec) throw new NotFoundException(`commissioning record ${id} not found`);

    const stored = await this.dms.createDocument(
      {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        // A calibration certificate is a PDF and the policy holds it to that; everything else a
        // test produces is what a phone, a scanner or an instrument printed.
        kind: category === 'certificate' ? 'certificate' : 'evidence',
        title: dto?.description?.trim() || file.originalname,
        aggregateType: 'commissioning.record',
        aggregateId: id,
        createdBy: ctx.actorId ?? null,
      },
      {
        fileName: file.originalname.split(/[\\/]/).pop() || 'attachment',
        contentType: file.mimetype || 'application/octet-stream',
        data: file.buffer,
      },
    );

    return this.service.addAttachment(ctx.tenantId, ctx.actorId, id, {
      fileId: stored.document.id,
      category,
      description: dto?.description,
      // COMPUTED HERE, never accepted from the caller: a hash supplied by whoever uploaded the
      // file attests to nothing.
      hash: stored.versions[0].checksum,
    });
  }

  @Put(':id/commission')
  async commission(@Param('id') id: string, @Body() dto: CommissionDto): Promise<CommissioningRecord> {
    if (!dto?.commissionedBy?.trim() || !dto?.witnessedBy?.trim()) {
      throw new BadRequestException('commissionedBy and witnessedBy are required');
    }
    const ctx = this.tenant.get();
    const rec = await this.service.get(id, ctx.tenantId);
    if (!rec) throw new NotFoundException(`commissioning record ${id} not found`);

    const supplied = dto.signoffEvidence ?? [];
    // ONE SIGNATURE PER PARTY. Two would leave the evidence pack choosing between them, and the
    // store's unique index would silently keep only the last.
    const parties = supplied.map((e) => e.party);
    if (new Set(parties).size !== parties.length) {
      throw new BadRequestException('each party may sign a sign-off once; send one entry per party');
    }

    const evidence: Array<{ party: SignoffParty; signedBy: string; method: SignoffMethod; authority?: SignatoryAuthority; documentId: string; documentHash: string }> = [];
    for (const item of supplied) {
      if (!SIGNOFF_PARTIES.includes(item.party)) {
        throw new BadRequestException(`a sign-off party must be one of ${SIGNOFF_PARTIES.join(', ')}`);
      }
      if (!ACCEPTANCE_METHODS.includes(item.method)) {
        throw new BadRequestException(`a sign-off method must be one of ${ACCEPTANCE_METHODS.join(', ')}`);
      }
      if (!item.signedBy?.trim()) {
        throw new BadRequestException('name the person who signed \u2014 whoever records a sign-off is not therefore its signatory');
      }
      // WHOSE WITNESS. Checked here so the message can name the field; the domain refuses it too,
      // and defaults the engineer to `contractor` rather than asking a question with one answer.
      if (item.authority && !SIGNATORY_AUTHORITIES.includes(item.authority)) {
        throw new BadRequestException(`a signatory authority must be one of ${SIGNATORY_AUTHORITIES.join(', ')}`);
      }
      if (item.party === 'witness' && !item.authority) {
        throw new BadRequestException('a witness signature must record whose witness it is \u2014 a consultant, the client and an authority inspector are three different standings on a certificate');
      }
      const decoded = decodeSignoffEvidence(item.evidence);
      const stored = await this.dms.createDocument(
        {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          // The category follows the method, so the file-type policy holds each to what it is: a
          // signature is an image or a PDF, an emailed confirmation is correspondence. Filing a
          // message as a signature is the first step towards printing it as one.
          kind: item.method === 'email' ? 'correspondence' : 'signature',
          title: `${rec.code} sign-off \u2014 ${item.party.replace(/_/g, ' ')} (${item.method})`,
          aggregateType: 'commissioning.record',
          aggregateId: id,
          createdBy: ctx.actorId ?? null,
        },
        {
          fileName: `signoff-${item.party}-${rec.code}.${decoded.extension}`,
          contentType: decoded.contentType,
          data: decoded.data,
        },
      );
      // COMPUTED BY DMS, never taken from the caller: a hash supplied by whoever sent the image
      // attests to nothing.
      const checksum = stored.versions[0]?.checksum;
      if (!checksum) throw new BadRequestException('the signature was stored without a checksum, so the sign-off cannot attest to it');
      evidence.push({
        party: item.party,
        signedBy: item.signedBy,
        method: item.method,
        authority: item.authority,
        documentId: stored.document.id,
        documentHash: checksum,
      });
    }

    return this.service.commission(id, ctx.tenantId, {
      commissionedBy: dto.commissionedBy,
      witnessedBy: dto.witnessedBy,
      evidence,
    }, ctx.actorId);
  }

  @Put(':id/fail')
  fail(@Param('id') id: string, @Body() dto: FailDto): Promise<CommissioningRecord> {
    if (!dto?.reason?.trim()) throw new BadRequestException('reason is required');
    return this.service.fail(id, this.tenant.get().tenantId, dto.reason);
  }

  /** The commissioning 360: the record with its test sheet + punch list. */
  @Get(':id/detail')
  async detail(@Param('id') id: string) {
    const found = await this.service.getDetail(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`commissioning record ${id} not found`);
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
    const signoffEvidence = await Promise.all(
      found.signoffEvidence.map(async (e) => ({
        ...e,
        integrity: await this.dms.verifyCommittedChecksum(e.documentId, e.documentHash),
      })),
    );
    return { ...found, signoffEvidence };
  }

  // ── Test sheet ───────────────────────────────────────────────────────────────

  @Get(':id/test-items')
  listTestItems(@Param('id') id: string): Promise<CommissioningTestItem[]> {
    return this.service.listTestItems(id, this.tenant.get().tenantId);
  }

  /**
   * Bind a record to the current approved revision for its system — explicitly, by a person, by the
   * revision's id. Never inferred from a discipline or a name; pinned for good once made.
   */
  @Post(':id/checklist-binding')
  bindChecklist(@Param('id') id: string, @Body() dto: BindChecklistDto): Promise<CommissioningRecord> {
    if (!dto?.itpId?.trim()) throw new BadRequestException('itpId is required');
    const ctx = this.tenant.get();
    return this.service.bindChecklist(id, ctx.tenantId, dto.itpId.trim(), ctx.actorId);
  }

  @Post(':id/test-items')
  addTestItem(@Param('id') id: string, @Body() dto: TestItemDto): Promise<CommissioningTestItem> {
    if (!dto?.pointNo?.trim()) throw new BadRequestException('pointNo is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    return this.service.addTestItem(id, this.tenant.get().tenantId, { pointNo: dto.pointNo, description: dto.description, expected: dto.expected ?? null });
  }

  /**
   * Execute a test point. POST, not PUT: this APPENDS a run to the point's lineage rather than
   * replacing its result, so it is not idempotent — sending it twice records two executions, which
   * is exactly what a retest is. The PUT spelling is kept below for existing callers.
   */
  @Post(':id/test-items/:itemId/runs')
  recordRun(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: TestResultDto): Promise<CommissioningTestItem> {
    if (dto?.result !== 'pass' && dto?.result !== 'fail') throw new BadRequestException('result must be pass or fail');
    const ctx = this.tenant.get();
    return this.service.recordTestResult(id, itemId, ctx.tenantId, { result: dto.result, actual: dto.actual ?? null, remarks: dto.remarks ?? null, testedBy: ctx.actorId });
  }

  /** Compatibility spelling for `POST :id/test-items/:itemId/runs`. Same append, same lineage. */
  @Put(':id/test-items/:itemId/result')
  recordResult(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: TestResultDto): Promise<CommissioningTestItem> {
    return this.recordRun(id, itemId, dto);
  }

  /** A point's full lineage, oldest run first — including the failures a later run corrected. */
  @Get(':id/test-items/:itemId/runs')
  listRuns(@Param('id') _id: string, @Param('itemId') itemId: string): Promise<CommissioningTestRun[]> {
    return this.service.listTestRunsForItem(itemId, this.tenant.get().tenantId);
  }

  /** Every run on the system, for the 360 and for export. */
  @Get(':id/test-runs')
  listAllRuns(@Param('id') id: string): Promise<CommissioningTestRun[]> {
    return this.service.listTestRuns(id, this.tenant.get().tenantId);
  }

  // ── Punch list ───────────────────────────────────────────────────────────────

  @Get(':id/punch')
  listPunch(@Param('id') id: string): Promise<PunchItem[]> {
    return this.service.listPunchItems(id, this.tenant.get().tenantId);
  }

  @Post(':id/punch')
  addPunch(@Param('id') id: string, @Body() dto: PunchDto): Promise<PunchItem> {
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    const ctx = this.tenant.get();
    return this.service.addPunchItem(id, ctx.tenantId, {
      description: dto.description,
      severity: dto.severity,
      location: dto.location ?? null,
      raisedBy: ctx.actorId,
      testItemId: dto.testItemId ?? null,
      sourceRunId: dto.sourceRunId ?? null,
    });
  }

  /** Record that a Quality ITP — or one point of it — applies to this system. */
  @Post(':id/itp-links')
  linkItp(@Param('id') id: string, @Body() dto: LinkItpDto) {
    if (!dto?.itpId?.trim()) throw new BadRequestException('itpId is required');
    const ctx = this.tenant.get();
    return this.service.linkItp(id, ctx.tenantId, {
      itpId: dto.itpId,
      pointIndex: dto.pointIndex ?? null,
      testItemId: dto.testItemId ?? null,
      linkedBy: ctx.actorId,
    });
  }

  @Get(':id/itp-links')
  listItpLinks(@Param('id') id: string) {
    return this.service.listItpLinks(id, this.tenant.get().tenantId);
  }

  @Delete(':id/itp-links/:linkId')
  async unlinkItp(@Param('id') id: string, @Param('linkId') linkId: string): Promise<{ ok: true }> {
    await this.service.unlinkItp(id, linkId, this.tenant.get().tenantId);
    return { ok: true };
  }

  // ── As-built links (TC-GATE-8) ───────────────────────────────────────────────────────────────
  //
  // The same shape as the ITP links above, and for the same reason: document control owns the
  // drawing, and T&C owns one sentence about it — that this entry is this system's as-built. The
  // register entry must already be marked as-built, which the service checks before writing.

  @Post(':id/asbuilt-links')
  linkAsBuilt(@Param('id') id: string, @Body() dto: { documentId?: string }) {
    if (!dto?.documentId?.trim()) throw new BadRequestException('documentId is required');
    const ctx = this.tenant.get();
    return this.service.linkAsBuilt(id, ctx.tenantId, { documentId: dto.documentId, linkedBy: ctx.actorId });
  }

  @Get(':id/asbuilt-links')
  listAsBuiltLinks(@Param('id') id: string) {
    return this.service.listAsBuiltLinks(id, this.tenant.get().tenantId);
  }

  @Delete(':id/asbuilt-links/:linkId')
  async unlinkAsBuilt(@Param('id') id: string, @Param('linkId') linkId: string): Promise<{ ok: true }> {
    await this.service.unlinkAsBuilt(id, linkId, this.tenant.get().tenantId);
    return { ok: true };
  }

  // ── Certificate link (TC-GATE-10) ────────────────────────────────────────────────────────────
  //
  // T&C generates the evidence; document control issues the document. This records that a register
  // entry IS this system's certificate. One per system, and only once the system is commissioned —
  // a certificate for unfinished work is a claim, and the register would then carry it.

  @Post(':id/certificate-link')
  linkCertificate(@Param('id') id: string, @Body() dto: { documentId?: string }) {
    if (!dto?.documentId?.trim()) throw new BadRequestException('documentId is required');
    const ctx = this.tenant.get();
    return this.service.linkCertificate(id, ctx.tenantId, { documentId: dto.documentId, linkedBy: ctx.actorId });
  }

  @Delete(':id/certificate-link/:linkId')
  async unlinkCertificate(@Param('id') id: string, @Param('linkId') linkId: string): Promise<{ ok: true }> {
    await this.service.unlinkCertificate(id, linkId, this.tenant.get().tenantId);
    return { ok: true };
  }

  /**
   * Record that a defect needs a Quality non-conformance, and the NCR that answers it.
   * T&C does not raise the NCR — Quality owns that, and this stores only a reference to it.
   */
  @Put(':id/punch/:punchId/escalate')
  escalate(@Param('id') id: string, @Param('punchId') punchId: string, @Body() dto: EscalateDto): Promise<PunchItem> {
    const ctx = this.tenant.get();
    return this.service.escalatePunchItem(id, punchId, ctx.tenantId, {
      qualityNcrId: dto?.qualityNcrId ?? null,
      escalatedBy: ctx.actorId,
    });
  }

  // The last of wave D's twelve. The RECORD was already right here — `raisedBy`, `closedBy` and
  // `closedAt` all exist and the controller already passed the actor — so nothing needed fixing
  // except that the act was reachable only through `commissioning.record.*` and governed by a name
  // no role spoke. NO RAISER/CLOSER SEPARATION, for the same reason as the snag: the inspector who
  // found the defect is the right person to verify the fix.
  @Put(':id/punch/:punchId/close')
  @Permissions('commissioning.record.close')
  closePunch(@Param('id') id: string, @Param('punchId') punchId: string, @Body() dto: ClosePunchDto): Promise<PunchItem> {
    if (!dto?.resolution?.trim()) throw new BadRequestException('resolution is required');
    const ctx = this.tenant.get();
    return this.service.closePunchItem(id, punchId, ctx.tenantId, { resolution: dto.resolution, closedBy: ctx.actorId });
  }
}
