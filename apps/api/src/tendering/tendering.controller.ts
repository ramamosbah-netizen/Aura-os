import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Headers, NotFoundException, Param, Patch, Post, Put, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccessService, CompaniesService, DmsService, Permissions, SettingsService, TenantContext, ParseUuidOr404Pipe, UsersService } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type Tender, type TenderStatus, TenderService, type BOQ, type BOQItem, type TenderSubmission, type SubmissionMethod, SUBMISSION_METHODS, type TenderSource, TENDER_SOURCES, type TenderClarification, type ClarificationKind, CLARIFICATION_KINDS, ClarificationService, parseBoqRows, type BoqImportResult } from '@aura/tendering';
import { AccountService, PreAwardPackageService, QuotationService, type TechnicalStudyContent } from '@aura/crm';
import { accountSnapshotPatch, resolveAccountSnapshot } from '../common/account-snapshot';
import { resolveDocumentIdentity } from '../common/document-identity';
import * as xlsx from 'xlsx';
import { CreateTechnicalStudyDto, StudyChangesDto, StudyReviewDto, UpdateTechnicalStudyDto, toTechnicalStudyContent } from '../crm/pre-award-package.controller';

class CreateTenderDto {
  @IsString() title!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() accountId?: string | null;
  @IsOptional() @IsString() accountName?: string | null;
  @IsOptional() @IsString() status?: TenderStatus;
  @IsOptional() @IsString() source?: TenderSource;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() submissionDeadline?: string;
  @IsOptional() @IsString() sourceOpportunityId?: string;
}

class UpdateTenderDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() source?: TenderSource;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() submissionDeadline?: string;
}

class CreateClarificationDto {
  @IsString() title!: string;
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() issuedAt?: string;
  @IsOptional() @IsString() responseDue?: string;
  @IsOptional() @IsString() deadlineExtendedTo?: string;
}

class TenderTakeoffLineDto {
  @IsOptional() @IsString() lineId?: string;
  @IsString() description!: string;
  @IsString() unit!: string;
  /** Null/omitted is genuinely unknown and blocks approval. */
  @IsOptional() @IsNumber() quantity?: number | null;
  @IsOptional() @IsString() sourceStudyItemId?: string;
}

class TenderTakeoffDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => TenderTakeoffLineDto)
  lines!: TenderTakeoffLineDto[];
}

const assertSource = (source?: string): void => {
  if (source !== undefined && !TENDER_SOURCES.includes(source as TenderSource)) {
    throw new BadRequestException(`source must be one of: ${TENDER_SOURCES.join(', ')}`);
  }
};

class SubmitTenderDto {
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() portal?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() submittedAt?: string;
  @IsOptional() @IsString() addendaAcknowledged?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsString() notes?: string;
}

/**
 * ADR-0021 — the customer's award evidence. MINIMUM structured evidence is money + currency +
 * award date; the reference and document are richer provenance and are deliberately optional in v1,
 * because a genuine award can exist without a clean reference number.
 *
 * `@Min(0)` states THE ZERO RULE at the HTTP boundary: a real 0 is a valid award, a negative one is
 * not. The same rule is restated in the domain factory (which every internal caller hits) and again
 * as a CHECK constraint in migration 0253 — three boundaries, one rule, the pattern migration 0252
 * established for win_probability.
 */
class AwardTenderDto {
  @IsNumber() @Min(0) awardedValue!: number;
  @IsString() currency!: string;
  @IsString() awardedAt!: string;
  @IsOptional() @IsString() awardReference?: string;
  @IsOptional() @IsString() evidenceDocumentId?: string;
}

/** Tendering API — stamps tenant/actor from context, delegates to TenderService. */
@Controller('tendering/tenders')
export class TenderingController {
  constructor(
    private readonly tenders: TenderService,
    private readonly clarifications: ClarificationService,
    private readonly accounts: AccountService,
    private readonly quotations: QuotationService,
    private readonly tenant: TenantContext,
    private readonly dms: DmsService,
    private readonly packages: PreAwardPackageService,
    private readonly users: UsersService,
    private readonly access: AccessService,
    // Who is issuing the proposal. Resolved from the tender's own company rather than borrowed
    // through a quotation, because the proposal may now be issued before any offer is approved.
    private readonly companies: CompaniesService,
    private readonly settings: SettingsService,
  ) {}

  private documentActor() {
    const ctx = this.tenant.get();
    return { userId: ctx.actorId ?? 'anonymous', tenantId: ctx.tenantId, companyId: ctx.companyId ?? null };
  }

  private studyReviewerTarget(tenantId: string, companyId: string | null) {
    return {
      permission: 'tendering.study.approve',
      orgPath: [{ level: 'tenant' as const, id: tenantId }, ...(companyId ? [{ level: 'company' as const, id: companyId }] : [])],
    };
  }

  private async ensureStudyPackage(id: string) {
    const ctx = this.tenant.get();
    const tender = await this.tenders.get(id);
    if (!tender || tender.tenantId !== ctx.tenantId) throw new NotFoundException('Tender not found');
    const pkg = await this.packages.openTender({ tenantId: ctx.tenantId, companyId: tender.companyId, tenderId: tender.id, createdBy: ctx.actorId });
    return { tenantId: ctx.tenantId, companyId: tender.companyId, packageId: pkg.id, tender };
  }

  private async assertEligibleStudyReviewer(tenantId: string, companyId: string | null, reviewerId: string, authorId: string) {
    if (reviewerId === authorId) throw new BadRequestException('technical reviewer must be independent from the study author');
    await this.users.ensureTenant(tenantId);
    if (!this.users.get(tenantId, reviewerId)?.active) throw new BadRequestException('technical reviewer must be an active workspace user');
    if (!this.access.can(reviewerId, this.studyReviewerTarget(tenantId, companyId)).allowed) {
      throw new BadRequestException('technical reviewer must hold tendering.study.approve for this tender context');
    }
  }

  private async canonicalizeTenderEvidence(tenderId: string, content: TechnicalStudyContent): Promise<TechnicalStudyContent> {
    const ids = new Set([...content.evidence.map((item) => item.documentId), ...content.surveyFindings.flatMap((item) => item.evidenceDocumentIds)]);
    const documents = new Map<string, Awaited<ReturnType<DmsService['getFor']>>>();
    for (const documentId of ids) {
      const resolved = await this.dms.getFor(documentId, this.documentActor());
      if (resolved.document.aggregateType !== 'tendering.tender' || resolved.document.aggregateId !== tenderId) {
        throw new BadRequestException('study evidence must belong to this tender');
      }
      documents.set(documentId, resolved);
    }
    return { ...content, evidence: content.evidence.map((item) => {
      const document = documents.get(item.documentId)!.document;
      return { documentId: document.id, title: document.title, kind: document.kind, revision: String(document.currentVersion) };
    }) };
  }

  /** Compose canonical Technical and Commercial authorities before anything leaves as a bid. */
  private async submissionReadiness(tender: Tender): Promise<{
    ready: boolean;
    technicalStudyApproved: boolean;
    technicalStudyId: string | null;
    technicalStudyRevision: number | null;
    quantityTakeoffProjected: boolean;
    quantityTakeoffRevisionId: string | null;
    commercialOfferApproved: boolean;
    commercialQuotationId: string | null;
    commercialQuoteNumber: string | null;
    commercialQuotationRevision: number | null;
    gaps: string[];
  }> {
    let technicalStudyApproved = false;
    let technicalStudyId: string | null = null;
    let technicalStudyRevision: number | null = null;
    try {
      const study = await this.packages.approvedTechnicalStudyForTender(tender.tenantId, tender.id);
      technicalStudyApproved = true;
      technicalStudyId = study.id;
      technicalStudyRevision = study.revisionNo;
    } catch {}
    const boq = await this.tenders.getBOQByTender(tender.tenantId, tender.id);
    const quantityTakeoffProjected = Boolean(boq?.boq.sourceBasisRevisionId && boq.boq.projectedAt);
    const quantityTakeoffRevisionId = boq?.boq.sourceBasisRevisionId ?? null;
    const quotations = await this.quotations.listBySourceTender(tender.tenantId, tender.id);
    const internallyApproved = quotations
      .filter((quotation) => ['approved', 'sent', 'under_negotiation', 'accepted'].includes(quotation.status))
      .sort((a, b) => b.revision - a.revision);
    let commercialOfferApproved = false;
    let commercialQuotationId: string | null = null;
    let commercialQuoteNumber: string | null = null;
    let commercialQuotationRevision: number | null = null;
    for (const quotation of internallyApproved) {
      if (await this.quotations.getBaseline(tender.tenantId, quotation.id)) {
        commercialOfferApproved = true;
        commercialQuotationId = quotation.id;
        commercialQuoteNumber = quotation.quoteNumber;
        commercialQuotationRevision = quotation.revision;
        break;
      }
    }
    const gaps = [
      ...(!technicalStudyApproved ? ['Complete independent approval of the Technical Study.'] : []),
      ...(!quantityTakeoffProjected ? ['Complete and approve the Quantity Take-Off, then send it to Estimation.'] : []),
      ...(!commercialOfferApproved ? ['Generate and internally approve the current commercial offer.'] : []),
    ];
    return {
      ready: gaps.length === 0,
      technicalStudyApproved,
      technicalStudyId,
      technicalStudyRevision,
      quantityTakeoffProjected,
      quantityTakeoffRevisionId,
      commercialOfferApproved,
      commercialQuotationId,
      commercialQuoteNumber,
      commercialQuotationRevision,
      gaps,
    };
  }

  private async assertSubmissionReadiness(tender: Tender): Promise<void> {
    const readiness = await this.submissionReadiness(tender);
    if (readiness.ready) return;
    throw new ConflictException(`only a tender with an approved technical study, approved quantity take-off and internally approved commercial offer can be submitted — ${readiness.gaps.join(' ')}`);
  }

  @Get(':id/submission-readiness')
  async getSubmissionReadiness(@Param('id', ParseUuidOr404Pipe) id: string) {
    const tender = await this.tenders.get(id);
    if (!tender) throw new NotFoundException(`tender ${id} not found`);
    return this.submissionReadiness(tender);
  }

  /**
   * Canonical customer technical-proposal source. The browser supplies only the Tender id: the
   * approved study and the approved scope are resolved from persisted relations. Prices and
   * internal costing are deliberately absent because this output accompanies, but is separate
   * from, the commercial quotation.
   *
   * IT RESTS ON THE APPROVED TECHNICAL STUDY, NOT ON THE OFFER IT ACCOMPANIES.
   *
   * It used to require full submission readiness, which includes an internally approved commercial
   * offer — and that made the journey a closed loop. The approval of an offer is gated on an
   * evidence checklist whose `COMMERCIAL_EVIDENCE_TEMPLATE` demands a TECHNICAL_PROPOSAL; the
   * proposal refused to exist until the offer was approved. Measured end to end on a real tender:
   * both sides returned 409 for ever, so no client-facing output and no tender submission was
   * reachable by anybody.
   *
   * The separation the loop violated is the one this system is built on: an estimate owns the
   * calculation, a commercial approval governs the selling decision, and a TECHNICAL proposal is
   * neither — it is the approved technical study made client-facing, and it carries no price. The
   * only thing it ever took from the commercial side was a reference number for its cover.
   *
   * So the commercial reference is now OPTIONAL AND HONEST: cited when an offer has been approved,
   * and stated as absent when it has not, rather than the document refusing to exist. The caller
   * is told which it is holding — `commercialOfferApproved` — because a proposal that quietly
   * omits its offer reference reads exactly like one that never had an offer.
   *
   * SUBMISSION IS UNCHANGED. `assertSubmissionReadiness` still requires the approved commercial
   * offer, so nothing here lets an unpriced tender reach a customer.
   */
  @Get(':id/technical-proposal')
  @Permissions('tendering.study.read', 'crm.quotation.read')
  async technicalProposal(@Param('id', ParseUuidOr404Pipe) id: string) {
    const tender = await this.tenders.get(id);
    if (!tender) throw new NotFoundException(`tender ${id} not found`);
    const readiness = await this.submissionReadiness(tender);
    // THE SCOPE MUST BE THE APPROVED SCOPE. A proposal describing a study nobody signed off, or a
    // scope that never reached the BOQ, is a document that commits the company to unreviewed work.
    if (!readiness.technicalStudyApproved || !readiness.quantityTakeoffProjected) {
      const blocking = readiness.gaps.filter((gap) => !gap.startsWith('Generate and internally approve'));
      throw new ConflictException(`technical proposal requires the approved Technical Study and its approved scope — ${blocking.join(' ')}`);
    }
    const study = await this.packages.approvedTechnicalStudyForTender(tender.tenantId, tender.id);
    return {
      tender: {
        id: tender.id,
        title: tender.title,
        reference: tender.reference,
        accountName: tender.accountName,
        submissionDeadline: tender.submissionDeadline,
      },
      study,
      /** The issuing company, independent of any offer. */
      documentIdentity: await resolveDocumentIdentity(this.companies, this.settings, tender.tenantId, tender.companyId ?? null),
      /** Whether the offer this proposal accompanies has been internally approved yet. */
      commercialOfferApproved: readiness.commercialOfferApproved,
      commercialReference: readiness.commercialQuotationId
        ? {
            quotationId: readiness.commercialQuotationId,
            quoteNumber: readiness.commercialQuoteNumber,
            revision: readiness.commercialQuotationRevision,
          }
        : null,
    };
  }

  @Get(':id/study-files')
  @Permissions('tendering.study.read')
  async studyFiles(@Param('id', ParseUuidOr404Pipe) id: string) {
    const ctx = this.tenant.get();
    const tender = await this.tenders.get(id);
    if (!tender || tender.tenantId !== ctx.tenantId) throw new NotFoundException('Tender not found');
    return this.dms.listFor({ aggregateType: 'tendering.tender', aggregateId: id, limit: 200 }, {
      userId: ctx.actorId ?? 'anonymous', tenantId: ctx.tenantId, companyId: ctx.companyId ?? null,
    });
  }

  @Post(':id/study-files')
  @Permissions('tendering.study.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async uploadStudyFile(@Param('id', ParseUuidOr404Pipe) id: string,
    @Body() body: { category?: string; title?: string; notes?: string },
    @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string }) {
    const ctx = this.tenant.get();
    const tender = await this.tenders.get(id);
    if (!tender || tender.tenantId !== ctx.tenantId) throw new NotFoundException('Tender not found');
    const categories = ['drawing', 'client_specification', 'client_requirement', 'authority_requirement', 'scope_summary', 'system_identification', 'government_requirement', 'site_information', 'site_survey', 'technical_reference', 'study_note'];
    if (!body.category || !categories.includes(body.category)) throw new BadRequestException('Choose a study category');
    if (!body.title?.trim() || body.title.length > 240) throw new BadRequestException('A title of up to 240 characters is required');
    if (!file?.buffer.length && !body.notes?.trim()) throw new BadRequestException('Upload a file or enter study notes');
    if ((body.notes?.length ?? 0) > 100000) throw new BadRequestException('Study notes are too long');
    // Each saved note/file is evidence in DMS; this endpoint never rewrites an earlier study entry.
    return this.dms.createDocument({ tenantId: ctx.tenantId, companyId: ctx.companyId,
      kind: body.category, title: body.title.trim(), aggregateType: 'tendering.tender', aggregateId: tender.id,
      createdBy: ctx.actorId ?? 'anonymous' }, {
      fileName: file ? file.originalname.split(/[\\/]/).pop() || 'attachment' : 'study-note.txt',
      contentType: file?.mimetype || 'text/plain',
      data: file ? file.buffer : Buffer.from(body.notes!.trim(), 'utf8'),
    });
  }

  @Post(':id/study-files/:documentId/versions')
  @Permissions('tendering.study.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async addStudyFileVersion(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('documentId', ParseUuidOr404Pipe) documentId: string,
    @Body() body: { note?: string },
    @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    await this.ensureStudyPackage(id);
    if (!file?.buffer.length) throw new BadRequestException('Choose a file for the new revision');
    const resolved = await this.dms.getFor(documentId, this.documentActor());
    if (resolved.document.aggregateType !== 'tendering.tender' || resolved.document.aggregateId !== id) {
      throw new BadRequestException('Study evidence must belong to this tender');
    }
    return this.dms.addVersion(documentId, {
      fileName: file.originalname.split(/[\\/]/).pop() || 'tender-study-evidence',
      contentType: file.mimetype || 'application/octet-stream', data: file.buffer,
    }, this.documentActor(), body.note);
  }

  @Get(':id/study-reviewers')
  @Permissions('tendering.study.read')
  async studyReviewers(@Param('id', ParseUuidOr404Pipe) id: string) {
    const { tenantId, companyId } = await this.ensureStudyPackage(id);
    await this.users.ensureTenant(tenantId);
    return this.users.list(tenantId).filter((user) => user.active)
      .filter((user) => this.access.can(user.userId, this.studyReviewerTarget(tenantId, companyId)).allowed)
      .map((user) => ({ userId: user.userId, displayName: user.displayName, email: user.email ?? null }));
  }

  @Get(':id/studies')
  @Permissions('tendering.study.read')
  async studies(@Param('id', ParseUuidOr404Pipe) id: string) {
    const { tenantId, packageId } = await this.ensureStudyPackage(id);
    return this.packages.listTechnicalStudies(tenantId, packageId);
  }

  @Post(':id/studies')
  @Permissions('tendering.study.create')
  async createStudy(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: CreateTechnicalStudyDto) {
    const { tenantId, companyId, packageId } = await this.ensureStudyPackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated study author is required');
    await this.assertEligibleStudyReviewer(tenantId, companyId, dto.reviewerId, actorId);
    const content = await this.canonicalizeTenderEvidence(id, toTechnicalStudyContent(dto));
    return this.packages.createTechnicalStudy({ tenantId, companyId, packageId, opportunityId: null,
      title: dto.title, inputRevision: dto.inputRevision, authorId: actorId, reviewerId: dto.reviewerId, ...content });
  }

  @Patch(':id/studies/:studyId')
  @Permissions('tendering.study.update')
  async updateStudy(@Param('id', ParseUuidOr404Pipe) id: string, @Param('studyId', ParseUuidOr404Pipe) studyId: string, @Body() dto: UpdateTechnicalStudyDto) {
    const { tenantId, companyId, packageId } = await this.ensureStudyPackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated study author is required');
    if (dto.reviewerId) await this.assertEligibleStudyReviewer(tenantId, companyId, dto.reviewerId, actorId);
    const content = await this.canonicalizeTenderEvidence(id, toTechnicalStudyContent(dto));
    return this.packages.updateTechnicalStudy({ tenantId, opportunityId: null, packageId, studyId, actorId,
      expectedUpdatedAt: dto.expectedUpdatedAt, patch: { title: dto.title, inputRevision: dto.inputRevision, reviewerId: dto.reviewerId, ...content } });
  }

  @Post(':id/studies/:studyId/submit')
  @Permissions('tendering.study.update')
  async submitStudy(@Param('id', ParseUuidOr404Pipe) id: string, @Param('studyId', ParseUuidOr404Pipe) studyId: string) {
    const { tenantId, packageId } = await this.ensureStudyPackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated study author is required');
    return this.packages.submitTechnicalStudy(tenantId, packageId, studyId, actorId);
  }

  @Post(':id/studies/:studyId/approve')
  @Permissions('tendering.study.approve')
  async approveStudy(@Param('id', ParseUuidOr404Pipe) id: string, @Param('studyId', ParseUuidOr404Pipe) studyId: string, @Body() dto: StudyReviewDto) {
    const { tenantId, packageId } = await this.ensureStudyPackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated reviewer is required');
    return this.packages.approveTechnicalStudy(tenantId, packageId, studyId, actorId, dto?.comment);
  }

  @Post(':id/studies/:studyId/request-changes')
  @Permissions('tendering.study.approve')
  async requestStudyChanges(@Param('id', ParseUuidOr404Pipe) id: string, @Param('studyId', ParseUuidOr404Pipe) studyId: string, @Body() dto: StudyChangesDto) {
    const { tenantId, packageId } = await this.ensureStudyPackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated reviewer is required');
    return this.packages.requestTechnicalStudyChanges(tenantId, packageId, studyId, actorId, dto.comment);
  }

  @Post()
  @Permissions('tendering.tender.create')
  async create(@Body() dto: CreateTenderDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Tender> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    assertSource(dto.source);
    const ctx = this.tenant.get();
    return this.tenders.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      accountId: dto.accountId ?? null,
      accountName: await resolveAccountSnapshot(this.accounts, dto.accountId, dto.accountName),
      status: dto.status,
      source: dto.source,
      value: dto.value,
      submissionDeadline: dto.submissionDeadline,
      sourceOpportunityId: dto.sourceOpportunityId,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    }, idempotencyKey);
  }

  /** PATCH /api/tendering/tenders/:id — update mutable fields (title, reference, value, account). */
  @Patch(':id')
  @Permissions('tendering.tender.update')
  async update(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateTenderDto): Promise<Tender> {
    assertSource(dto.source);
    try {
      return await this.tenders.update(id, {
        title: dto.title,
        reference: dto.reference,
        source: dto.source,
        value: dto.value,
        accountId: dto.accountId,
        ...(await accountSnapshotPatch(this.accounts, dto.accountId, dto.accountName)),
        submissionDeadline: dto.submissionDeadline,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  /**
   * PATCH /api/tendering/tenders/:id/status
   * Transition a tender's status.
   *
   * ADR-0021 — `won` is NOT available here: a win is a customer award and must carry its evidence.
   * The service rejects it; use POST :id/award below.
   */
  @Patch(':id/status')
  @Permissions('tendering.tender.status')
  async changeStatus(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { status: TenderStatus },
  ): Promise<Tender> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    if (dto.status === 'submitted') await this.assertSubmissionReadiness(found);
    return this.tenders.changeStatus(id, dto.status);
  }

  /**
   * POST /api/tendering/tenders/:id/award — ADR-0021: the single governed path to `won`.
   *
   * Validates the customer's award evidence, persists it, transitions the tender and emits
   * `tendering.tender.awarded` in ONE transaction. The event then drives the deal chain: the Contract
   * is auto-created (inheriting the approved commercial baseline, unchanged), and the source
   * Opportunity closes Won with `awardSource='tender_award'` and the AWARDED value as its contracted
   * value — GOVERNED_WON, on the same footing as an accepted quotation.
   *
   * A tender awarded without this evidence stays "award not evidenced" (LEGACY_WON), by design.
   */
  @Post(':id/award')
  @Permissions('tendering.tender.award')
  async award(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: AwardTenderDto,
  ): Promise<Tender> {
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    // WHO captured it — from the request context, never from the body: a client must not be able to
    // attribute an award capture to someone else.
    //
    // No `'system'` fallback. A governed customer award must carry a REAL identity for whoever
    // recorded the evidence; substituting a placeholder would put an unattributable award into the
    // audit trail while looking captured. If a system-generated award is ever needed it gets its own
    // explicit source and path, rather than impersonating a user that does not exist.
    const capturedBy = this.tenant.get().actorId;
    if (!capturedBy) {
      throw new BadRequestException('Capturing award evidence requires an authenticated user');
    }

    // The award-time COMMERCIAL BASIS. Resolved HERE, in the app layer, because only this layer may
    // read across tendering -> quotation -> baseline. Pinning it now is the whole point: the contract
    // reactor used to resolve it when it happened to run, so a quotation accepted in the delivery
    // window changed which baseline the contract inherited.
    //
    // No basis is a legitimate award: the tender wins, NO contract is created, and it reads
    // "awaiting commercial basis" until one locks. `tender.value` is NEVER substituted.
    const basis = await this.resolveAwardBasis(this.tenant.get().tenantId, id);

    return this.tenders.award(
      id,
      {
        awardedValue: dto.awardedValue,
        currency: dto.currency,
        awardedAt: dto.awardedAt,
        awardReference: dto.awardReference ?? null,
        evidenceDocumentId: dto.evidenceDocumentId ?? null,
        capturedBy,
      },
      basis,
    );
  }

  /**
   * The approved commercial baseline behind this tender's decided quotation, if one is locked now.
   * Ranked accepted > approved > sent, the same order the contract reactor used — the change is WHEN
   * the choice is made (once, at the award) rather than HOW it is made.
   *
   * Enrichment, so a lookup failure must not fail the award: an award that cannot be recorded is far
   * worse than one recorded without a basis, which is an expected and handled state.
   */
  private async resolveAwardBasis(
    tenantId: string,
    tenderId: string,
  ): Promise<{ baselineId: string; quotationId: string; value: number } | null> {
    try {
      const quotes = await this.quotations.list({ tenantId, sourceTenderId: tenderId, limit: 50 });
      if (!quotes?.length) return null;
      const rank = (status: string): number => (status === 'accepted' ? 0 : status === 'approved' ? 1 : status === 'sent' ? 2 : 3);
      const decided = quotes.filter((q) => rank(q.status) < 3).sort((a, b) => rank(a.status) - rank(b.status));
      for (const q of decided) {
        const baseline = await this.quotations.getBaseline(tenantId, q.id);
        // `baseline.total` — the Contract Value measure, VAT-inclusive. Unchanged by this slice.
        if (baseline) return { baselineId: baseline.id, quotationId: q.id, value: baseline.total };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * POST /api/tendering/tenders/:id/submit — T2: the `→ submitted` transition WITH its facts
   * (method, portal, reference, addenda acknowledged, validity). Same gate as the status route;
   * on an already-submitted tender this records a resubmission (a second record, not an edit).
   */
  @Post(':id/submit')
  @Permissions('tendering.tender.submit')
  async submit(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: SubmitTenderDto,
  ): Promise<{ tender: Tender; submission: TenderSubmission }> {
    if (dto.method !== undefined && !SUBMISSION_METHODS.includes(dto.method as SubmissionMethod)) {
      throw new BadRequestException(`method must be one of: ${SUBMISSION_METHODS.join(', ')}`);
    }
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    await this.assertSubmissionReadiness(found);
    const ctx = this.tenant.get();
    // The submission value is the current server-resolved approved offer when one exists. The
    // request cannot nominate a quotation/baseline (unknown DTO fields are stripped globally), so
    // an old revision cannot be selected as the bid value and the user never retypes commercial
    // truth that already exists in the frozen baseline.
    const basis = await this.resolveAwardBasis(ctx.tenantId, id);
    return this.tenders.submit(id, {
      method: (dto.method as SubmissionMethod) ?? null,
      portal: dto.portal ?? null,
      reference: dto.reference ?? null,
      submittedAt: dto.submittedAt ?? null,
      addendaAcknowledged: dto.addendaAcknowledged ?? null,
      validUntil: dto.validUntil ?? null,
      notes: dto.notes ?? null,
      submittedBy: ctx.actorId,
      createdBy: ctx.actorId,
    }, basis?.value);
  }

  /** GET /api/tendering/tenders/:id/submissions — the submission records, latest first. */
  @Get(':id/submissions')
  async submissions(@Param('id', ParseUuidOr404Pipe) id: string): Promise<TenderSubmission[]> {
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return this.tenders.listSubmissions(this.tenant.get().tenantId, id);
  }

  /**
   * T4 — clarifications & addenda: the Q&A/change traffic on a tender. An addendum with
   * `deadlineExtendedTo` also moves the tender's submission deadline.
   */
  @Post(':id/clarifications')
  @Permissions('tendering.tender.clarifications')
  async addClarification(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: CreateClarificationDto,
  ): Promise<TenderClarification> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (dto.kind !== undefined && !CLARIFICATION_KINDS.includes(dto.kind as ClarificationKind)) {
      throw new BadRequestException(`kind must be one of: ${CLARIFICATION_KINDS.join(', ')}`);
    }
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    const ctx = this.tenant.get();
    return this.clarifications.record({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      tenderId: id,
      kind: (dto.kind as ClarificationKind) ?? null,
      reference: dto.reference ?? null,
      title: dto.title,
      body: dto.body ?? null,
      issuedAt: dto.issuedAt ?? null,
      responseDue: dto.responseDue ?? null,
      deadlineExtendedTo: dto.deadlineExtendedTo ?? null,
      createdBy: ctx.actorId,
    });
  }

  /** The clarification/addendum trail, latest first. `?open=true` filters to unanswered. */
  @Get(':id/clarifications')
  async listClarifications(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Query('kind') kind?: string,
    @Query('open') open?: string,
  ): Promise<TenderClarification[]> {
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return this.clarifications.list({ tenantId: this.tenant.get().tenantId, tenderId: id, kind, open: open === 'true' });
  }

  /** Answer a clarification / acknowledge an addendum. */
  @Patch(':id/clarifications/:clarificationId/answer')
  @Permissions('tendering.tender.answer')
  async answerClarification(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('clarificationId', ParseUuidOr404Pipe) clarificationId: string,
    @Body() dto: { answer?: string },
  ): Promise<TenderClarification> {
    if (!dto?.answer?.trim()) throw new BadRequestException('answer is required');
    const ctx = this.tenant.get();
    try {
      return await this.clarifications.answer(ctx.tenantId, clarificationId, dto.answer, ctx.actorId);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw e;
    }
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('source') source?: string,
  ): Promise<Tender[]> {
    return this.tenders.list({ status, accountId, source, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.tenders.listPaged(
      { tenantId: this.tenant.get().tenantId, status, accountId },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Tender> {
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return found;
  }

  // ── BOQ & Cost Estimating ─────────────────────────────────────

  @Get(':id/quantity-takeoff')
  @Permissions('tendering.takeoff.read')
  async quantityTakeoff(@Param('id', ParseUuidOr404Pipe) id: string) {
    const { tenantId } = await this.ensureStudyPackage(id);
    const aggregate = await this.packages.readTenderAggregate(tenantId, id);
    return {
      packageId: aggregate.package?.id ?? null,
      approvedStudy: aggregate.studies.filter((study) => study.status === 'approved').at(-1) ?? null,
      revisions: aggregate.basis,
    };
  }

  @Post(':id/quantity-takeoff')
  @Permissions('tendering.takeoff.create')
  async createQuantityTakeoff(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: TenderTakeoffDto,
  ) {
    if (!Array.isArray(dto?.lines) || dto.lines.length === 0) throw new BadRequestException('lines must be a non-empty array');
    for (const line of dto.lines) {
      if (!line.description?.trim()) throw new BadRequestException('each quantity take-off line needs a description');
      if (!line.unit?.trim()) throw new BadRequestException('each quantity take-off line needs a unit');
      if (line.quantity !== undefined && line.quantity !== null && line.quantity < 0) {
        throw new BadRequestException('quantity must be >= 0 or left unknown');
      }
    }
    const { tenantId, companyId, packageId } = await this.ensureStudyPackage(id);
    return this.packages.createTenderTakeoff({
      tenantId, companyId, tenderId: id, packageId, createdBy: this.tenant.get().actorId,
      lines: dto.lines.map((line) => ({
        description: line.description,
        unit: line.unit,
        quantity: line.quantity === undefined ? null : line.quantity,
        sourceStudyItemId: line.sourceStudyItemId ?? null,
      })),
    });
  }

  @Patch(':id/quantity-takeoff/:basisId/lines')
  @Permissions('tendering.takeoff.update')
  async updateQuantityTakeoff(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('basisId', ParseUuidOr404Pipe) basisId: string,
    @Body() dto: TenderTakeoffDto,
  ) {
    if (!Array.isArray(dto?.lines) || dto.lines.length === 0) throw new BadRequestException('lines must be a non-empty array');
    if (dto.lines.some((line) => !line.lineId)) throw new BadRequestException('lineId is required when editing a quantity take-off');
    for (const line of dto.lines) {
      if (!line.description?.trim() || !line.unit?.trim()) throw new BadRequestException('each line needs a description and unit');
      if (line.quantity !== undefined && line.quantity !== null && line.quantity < 0) {
        throw new BadRequestException('quantity must be >= 0 or left unknown');
      }
    }
    const { tenantId, packageId } = await this.ensureStudyPackage(id);
    return this.packages.updateTenderTakeoff({
      tenantId, tenderId: id, packageId, basisId, editedBy: this.tenant.get().actorId,
      lines: dto.lines.map((line) => ({
        lineId: line.lineId!, description: line.description, unit: line.unit,
        quantity: line.quantity === undefined ? null : line.quantity,
      })),
    });
  }

  @Post(':id/quantity-takeoff/:basisId/approve')
  @Permissions('tendering.takeoff.approve')
  async approveQuantityTakeoff(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('basisId', ParseUuidOr404Pipe) basisId: string,
  ) {
    const { tenantId, packageId } = await this.ensureStudyPackage(id);
    return this.packages.approveScopeBasisById(tenantId, packageId, basisId, this.tenant.get().actorId);
  }

  @Post(':id/quantity-takeoff/:basisId/project-to-boq')
  @Permissions('tendering.takeoff.project')
  async projectQuantityTakeoff(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('basisId', ParseUuidOr404Pipe) basisId: string,
  ) {
    const { tenantId, companyId } = await this.ensureStudyPackage(id);
    const basis = await this.packages.approvedTenderTakeoff(tenantId, id, basisId);
    return this.tenders.projectApprovedTakeoff({
      tenantId, companyId, tenderId: id, basisRevisionId: basis.id,
      sourceRevisionRef: basis.sourceRevRef, projectedBy: this.tenant.get().actorId,
      lines: basis.lines,
    });
  }

  @Get(':id/boq')
  @Permissions('tendering.estimate.read')
  async getBOQ(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ boq: BOQ; items: BOQItem[] }> {
    const tender = await this.tenders.get(id);
    if (!tender) throw new NotFoundException(`tender ${id} not found`);
    const ctx = this.tenant.get();
    return this.tenders.getOrCreateBOQ(ctx.tenantId, tender.companyId, id);
  }

  @Post(':id/boq/items')
  @Permissions('tendering.estimate.create')
  async addBOQItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { boqId: string; itemCode: string; description: string; unit: string; quantity: number; rate: number; ifcGuid?: string },
  ): Promise<BOQItem> {
    if (!dto.boqId) throw new BadRequestException('boqId is required');
    if (!dto.itemCode?.trim()) throw new BadRequestException('itemCode is required');
    if (!dto.description?.trim()) throw new BadRequestException('description is required');
    if (!dto.unit?.trim()) throw new BadRequestException('unit is required');
    if (dto.quantity === undefined || dto.quantity < 0) throw new BadRequestException('quantity must be >= 0');
    if (dto.rate === undefined || dto.rate < 0) throw new BadRequestException('rate must be >= 0');

    const ctx = this.tenant.get();
    await this.tenders.assertBOQOwnedByTender(ctx.tenantId, id, dto.boqId).catch(() => {
      throw new NotFoundException('BOQ not found for this Tender');
    });
    return this.tenders.addBOQItem(ctx.tenantId, ctx.companyId, dto.boqId, {
      itemCode: dto.itemCode,
      description: dto.description,
      unit: dto.unit,
      quantity: dto.quantity,
      rate: dto.rate,
      ifcGuid: dto.ifcGuid,
    });
  }

  @Put(':id/boq/items/:itemId')
  @Permissions('tendering.estimate.update')
  async updateBOQItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('itemId') itemId: string,
    @Body() dto: { itemCode?: string; description?: string; unit?: string; quantity?: number; rate?: number; ifcGuid?: string | null },
  ): Promise<BOQItem> {
    const ctx = this.tenant.get();
    await this.tenders.assertBOQItemOwnedByTender(ctx.tenantId, id, itemId).catch(() => {
      throw new NotFoundException('BOQ item not found for this Tender');
    });
    return this.tenders.updateBOQItem(ctx.tenantId, itemId, dto);
  }

  @Delete(':id/boq/items/:itemId')
  @Permissions('tendering.estimate.update')
  async deleteBOQItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const ctx = this.tenant.get();
    await this.tenders.assertBOQItemOwnedByTender(ctx.tenantId, id, itemId).catch(() => {
      throw new NotFoundException('BOQ item not found for this Tender');
    });
    return this.tenders.deleteBOQItem(ctx.tenantId, itemId);
  }

  /** JSON bulk import (the paste-text path). `mode: 'replace'` clears the existing BOQ first. */
  @Post(':id/boq/import')
  @Permissions('tendering.estimate.create')
  async importBOQ(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { boqId: string; mode?: 'append' | 'replace'; items: Array<{ itemCode: string; description: string; unit: string; quantity: number; rate: number; ifcGuid?: string }> },
  ): Promise<{ items: BOQItem[]; replaced: number }> {
    if (!dto.boqId) throw new BadRequestException('boqId is required');
    if (!Array.isArray(dto.items) || dto.items.length === 0) throw new BadRequestException('items must be a non-empty array');
    if (dto.mode !== undefined && dto.mode !== 'append' && dto.mode !== 'replace') {
      throw new BadRequestException("mode must be 'append' or 'replace'");
    }

    const ctx = this.tenant.get();
    await this.tenders.assertBOQOwnedByTender(ctx.tenantId, id, dto.boqId).catch(() => {
      throw new NotFoundException('BOQ not found for this Tender');
    });
    return this.tenders.importBOQItems(ctx.tenantId, ctx.companyId, dto.boqId, dto.items, { replace: dto.mode === 'replace' });
  }

  /**
   * T5 — Excel BOQ import. The workbook's first sheet is parsed by the domain parser
   * (header-row scan, synonym columns, cleaned numbers, per-row issues — see
   * `domain/boq-import.ts`). `dryRun=true` returns the parse WITHOUT importing (the preview);
   * `mode=replace` clears the existing BOQ first (each cleared item takes its build-up along).
   */
  @Post(':id/boq/upload')
  @Permissions('tendering.estimate.create')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBOQ(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body('boqId') boqId: string,
    @Body('mode') mode: string | undefined,
    @Body('dryRun') dryRun: string | undefined,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<{ items: BOQItem[]; replaced: number; issues: BoqImportResult['issues']; headerRow: number } | (BoqImportResult & { dryRun: true })> {
    if (!file) throw new BadRequestException('file is required');
    if (!boqId) throw new BadRequestException('boqId is required');
    if (mode !== undefined && mode !== 'append' && mode !== 'replace') {
      throw new BadRequestException("mode must be 'append' or 'replace'");
    }

    let parsed: BoqImportResult;
    try {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('the workbook has no sheets — an .xlsx file with at least one sheet is required');
      const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      parsed = parseBoqRows(rows);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Failed to parse the Excel file');
    }
    if (parsed.items.length === 0) {
      throw new BadRequestException(
        `no importable rows found (header on row ${parsed.headerRow}; ${parsed.issues.length} issue(s): ${parsed.issues.slice(0, 3).map((i) => `row ${i.row} — ${i.problem}`).join('; ')})`,
      );
    }

    if (dryRun === 'true') return { ...parsed, dryRun: true };

    const ctx = this.tenant.get();
    await this.tenders.assertBOQOwnedByTender(ctx.tenantId, id, boqId).catch(() => {
      throw new NotFoundException('BOQ not found for this Tender');
    });
    const result = await this.tenders.importBOQItems(ctx.tenantId, ctx.companyId, boqId, parsed.items, { replace: mode === 'replace' });
    return { ...result, issues: parsed.issues, headerRow: parsed.headerRow };
  }
}
