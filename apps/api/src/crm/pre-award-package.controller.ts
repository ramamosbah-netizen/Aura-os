import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AccessService, DmsService, TenantContext, ParseUuidOr404Pipe, Permissions, UsersService } from '@aura/core';
import {
  type BasisLine, OpportunityService, PreAwardPackageService, QuotationService,
  LeadService,
  type StudyCompliance, type StudyClarificationStatus, type StudyDeviationStatus,
  type StudyRequirementCategory, type TechnicalStudyContent,
} from '@aura/crm';
import { elvSystemLabel, type PricingPolicy, type PricingDiscount } from '@aura/shared';

class ScopeLineDto {
  @IsString() lineId!: string;
  @IsString() description!: string;
  @IsString() unit!: string;
  /** Null = the quantity is genuinely UNKNOWN. It is not zero, and it blocks approval downstream. */
  @IsOptional() @IsNumber() quantity?: number | null;
  @IsString() sourceLineId!: string;
}
class EditScopeLinesDto {
  @IsArray() lines!: ScopeLineDto[];
}

/**
 * DTO → domain. An omitted quantity means UNKNOWN (null) — never 0. Keeping this in one place is what
 * stops a caller from re-introducing the silent zero the estimate then prices at nothing.
 */
function toBasisLines(lines: ScopeLineDto[] = []): BasisLine[] {
  return lines.map((l) => ({
    lineId: l.lineId,
    description: l.description,
    unit: l.unit,
    quantity: l.quantity === undefined ? null : l.quantity,
    sourceLineId: l.sourceLineId,
  }));
}
class AddScopeDto {
  /** @deprecated The source is resolved from the persisted approved technical study. */
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsString() sourceRevRef?: string;
  @IsArray() lines!: ScopeLineDto[];
  /** @deprecated Approval is a separate governed command. */
  @IsOptional() @IsBoolean() approve?: boolean;
}
class BuildUpComponentDto {
  @IsString() costType!: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsNumber() unitCost!: number;
}
/** A manpower block — count × hours at an hourly rate, entered as line totals (the engine divides). */
class ManpowerBlockDto {
  @IsOptional() @IsNumber() count?: number;
  @IsOptional() @IsNumber() hours?: number;
  @IsOptional() @IsNumber() rate?: number;
}
/** Structured Materials/Labour/Plant/Subcontract/Other sheet for one line. The engine costs it. */
class ResourceBreakdownDto {
  @IsOptional() @IsNumber() supplyUnitPrice?: number;
  @IsOptional() @IsNumber() wastagePercent?: number;
  @IsOptional() @IsNumber() accessories?: number;
  @IsOptional() @ValidateNested() @Type(() => ManpowerBlockDto) technician?: ManpowerBlockDto;
  @IsOptional() @ValidateNested() @Type(() => ManpowerBlockDto) engineer?: ManpowerBlockDto;
  @IsOptional() @ValidateNested() @Type(() => ManpowerBlockDto) projectManager?: ManpowerBlockDto;
  @IsOptional() @IsNumber() transport?: number;
  @IsOptional() @IsNumber() equipmentRent?: number;
  @IsOptional() @IsNumber() subcontract?: number;
  @IsOptional() @IsNumber() otherDirect?: number;
}
class BuildUpDto {
  @IsString() basisLineId!: string;
  @IsOptional() @IsArray() components?: BuildUpComponentDto[];
  @IsOptional() @ValidateNested() @Type(() => ResourceBreakdownDto) resources?: ResourceBreakdownDto;
  @IsOptional() @IsNumber() indirectPercent?: number;
  @IsOptional() @IsNumber() overheadPercent?: number;
  @IsOptional() @IsNumber() riskPercent?: number;
  @IsOptional() @IsNumber() profitPercent?: number; // accepted, ignored — an estimate makes no selling decision
  @IsOptional() @IsString() notes?: string;
}
class UpdateBuildUpsDto {
  @IsArray() buildUps!: BuildUpDto[];
}
class AddEstimateDto {
  @IsString() basisRevisionId!: string;
  /** Optional compatibility echo. The service verifies it against the persisted approved basis. */
  @IsOptional() @IsArray() lines?: ScopeLineDto[];
  @IsArray() buildUps!: BuildUpDto[];
  /** @deprecated Freeze and approval are separate governed commands. */
  @IsOptional() @IsBoolean() approve?: boolean;
}
/** The commercial decision at freeze time. Absent = legacy reproduce; present = explicit policy. */
class FreezePricingDto {
  @IsOptional() @IsIn(['target_margin', 'markup']) method?: 'target_margin' | 'markup';
  @IsOptional() @IsNumber() percent?: number;
}
/** A commercial policy (+ optional discount) for the Pricing Workspace. */
class PricingPolicyDto {
  @IsOptional() @IsIn(['target_margin', 'markup']) method?: 'target_margin' | 'markup';
  @IsOptional() @IsNumber() percent?: number;
  @IsOptional() @IsIn(['percent', 'amount']) discountKind?: 'percent' | 'amount';
  @IsOptional() @IsNumber() discountValue?: number;
}

class StudySystemDto {
  @IsOptional() @IsString() id?: string;
  @IsString() discipline!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() designBasis?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) interfaces?: string[];
}
class StudyRequirementDto {
  @IsOptional() @IsString() id?: string;
  @IsIn(['client', 'authority', 'technical', 'site']) category!: StudyRequirementCategory;
  @IsString() statement!: string;
  @IsOptional() @IsString() acceptanceCriteria?: string;
  @IsOptional() @IsString() sourceRef?: string;
  @IsOptional() @IsString() sourceRequirementId?: string;
  @IsIn(['unassessed', 'compliant', 'partial', 'deviation', 'not_applicable']) compliance!: StudyCompliance;
  @IsOptional() @IsString() response?: string;
}
class StudySurveyFindingDto {
  @IsOptional() @IsString() id?: string;
  @IsString() area!: string;
  @IsString() observation!: string;
  @IsOptional() @IsString() impact?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) evidenceDocumentIds?: string[];
}
class StudyClarificationDto {
  @IsOptional() @IsString() id?: string;
  @IsString() question!: string;
  @IsOptional() @IsString() requestedFrom?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsIn(['open', 'answered', 'closed']) status!: StudyClarificationStatus;
  @IsOptional() @IsString() answer?: string;
  @IsOptional() @IsString() reference?: string;
}
class StudyDeviationDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() requirementRef?: string;
  @IsString() description!: string;
  @IsOptional() @IsString() impact?: string;
  @IsOptional() @IsString() proposedResolution?: string;
  @IsIn(['open', 'accepted', 'rejected']) status!: StudyDeviationStatus;
}
class StudyEvidenceDto {
  @IsString() documentId!: string;
  @IsString() title!: string;
  @IsString() kind!: string;
  @IsOptional() @IsString() revision?: string;
}
class TechnicalStudyContentDto {
  @IsString() scopeSummary!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => StudySystemDto) systems!: StudySystemDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => StudyRequirementDto) requirements!: StudyRequirementDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => StudySurveyFindingDto) surveyFindings!: StudySurveyFindingDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => StudyClarificationDto) clarifications!: StudyClarificationDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => StudyDeviationDto) deviations!: StudyDeviationDto[];
  @IsArray() @IsString({ each: true }) assumptions!: string[];
  @IsArray() @IsString({ each: true }) exclusions!: string[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => StudyEvidenceDto) evidence!: StudyEvidenceDto[];
}
export class CreateTechnicalStudyDto extends TechnicalStudyContentDto {
  @IsString() title!: string;
  @IsString() inputRevision!: string;
  @IsString() reviewerId!: string;
}
export class UpdateTechnicalStudyDto extends TechnicalStudyContentDto {
  @IsString() expectedUpdatedAt!: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() inputRevision?: string;
  @IsOptional() @IsString() reviewerId?: string;
}
export class StudyReviewDto {
  @IsOptional() @IsString() comment?: string;
}
export class StudyChangesDto {
  @IsString() comment!: string;
}

export function toTechnicalStudyContent(dto: TechnicalStudyContentDto): TechnicalStudyContent {
  return {
    scopeSummary: dto.scopeSummary,
    systems: dto.systems.map((item) => ({ id: item.id ?? '', discipline: item.discipline, name: item.name, designBasis: item.designBasis ?? '', interfaces: item.interfaces ?? [] })),
    requirements: dto.requirements.map((item) => ({ id: item.id ?? '', category: item.category, statement: item.statement, acceptanceCriteria: item.acceptanceCriteria ?? '', sourceRef: item.sourceRef ?? '', sourceRequirementId: item.sourceRequirementId ?? null, compliance: item.compliance, response: item.response ?? '' })),
    surveyFindings: dto.surveyFindings.map((item) => ({ id: item.id ?? '', area: item.area, observation: item.observation, impact: item.impact ?? '', evidenceDocumentIds: item.evidenceDocumentIds ?? [] })),
    clarifications: dto.clarifications.map((item) => ({ id: item.id ?? '', question: item.question, requestedFrom: item.requestedFrom ?? '', dueDate: item.dueDate ?? null, status: item.status, answer: item.answer ?? '', reference: item.reference ?? '' })),
    deviations: dto.deviations.map((item) => ({ id: item.id ?? '', requirementRef: item.requirementRef ?? '', description: item.description, impact: item.impact ?? '', proposedResolution: item.proposedResolution ?? '', status: item.status })),
    assumptions: dto.assumptions,
    exclusions: dto.exclusions,
    evidence: dto.evidence.map((item) => ({ documentId: item.documentId, title: item.title, kind: item.kind, revision: item.revision ?? '' })),
  };
}
/** DTO → domain discount, or null when none is given. */
function toDiscount(dto: PricingPolicyDto): PricingDiscount | null {
  return dto?.discountKind ? { kind: dto.discountKind, value: Number(dto.discountValue) || 0 } : null;
}

/**
 * Direct Pre-Award PACKAGE lifecycle (Phase 3) — open a package for an opportunity, then drive the
 * Scope → Estimate → Pricing chain that governs its quotation. Distinct from the older scope-discovery
 * API (PreAwardController). Nested under the opportunity; the package is the single owner of the chain.
 */
@Controller('crm/opportunities')
export class CrmPreAwardPackageController {
  constructor(
    private readonly packages: PreAwardPackageService,
    private readonly opportunities: OpportunityService,
    private readonly leads: LeadService,
    private readonly quotations: QuotationService,
    private readonly tenant: TenantContext,
    private readonly users: UsersService,
    private readonly access: AccessService,
    private readonly dms: DmsService,
  ) {}

  private documentActor() {
    const ctx = this.tenant.get();
    return { userId: ctx.actorId ?? 'anonymous', tenantId: ctx.tenantId, companyId: ctx.companyId ?? null };
  }

  private async canonicalizeEvidence(opportunityId: string, content: TechnicalStudyContent): Promise<TechnicalStudyContent> {
    const opportunity = await this.opportunities.get(opportunityId);
    if (!opportunity) throw new NotFoundException(`opportunity ${opportunityId} not found`);
    const ids = new Set([
      ...content.evidence.map((item) => item.documentId),
      ...content.surveyFindings.flatMap((item) => item.evidenceDocumentIds),
    ]);
    const documents = new Map<string, Awaited<ReturnType<DmsService['getFor']>>>();
    for (const documentId of ids) {
      const resolved = await this.dms.getFor(documentId, this.documentActor());
      const direct = resolved.document.aggregateType === 'crm.opportunity' && resolved.document.aggregateId === opportunityId;
      const fromSalesIntake = !!opportunity.leadId
        && resolved.document.aggregateType === 'crm.lead'
        && resolved.document.aggregateId === opportunity.leadId;
      if (!direct && !fromSalesIntake) throw new BadRequestException('study evidence must belong to this opportunity or its source enquiry');
      documents.set(documentId, resolved);
    }
    return {
      ...content,
      evidence: content.evidence.map((item) => {
        const document = documents.get(item.documentId)!.document;
        return { documentId: document.id, title: document.title, kind: document.kind, revision: String(document.currentVersion) };
      }),
    };
  }

  private reviewerTarget(tenantId: string, companyId: string | null) {
    return {
      permission: 'crm.study.approve',
      orgPath: [
        { level: 'tenant' as const, id: tenantId },
        ...(companyId ? [{ level: 'company' as const, id: companyId }] : []),
      ],
    };
  }

  private async assertEligibleReviewer(
    tenantId: string,
    companyId: string | null,
    reviewerId: string,
    authorId: string,
  ): Promise<void> {
    if (reviewerId === authorId) throw new BadRequestException('technical reviewer must be independent from the study author');
    await this.users.ensureTenant(tenantId);
    if (!this.users.get(tenantId, reviewerId)?.active) {
      throw new BadRequestException('technical reviewer must be an active workspace user');
    }
    if (!this.access.can(reviewerId, this.reviewerTarget(tenantId, companyId)).allowed) {
      throw new BadRequestException('technical reviewer must hold crm.study.approve for this opportunity context');
    }
  }

  private async ensurePackage(id: string): Promise<{ tenantId: string; companyId: string | null; packageId: string }> {
    const ctx = this.tenant.get();
    const opp = await this.opportunities.get(id);
    if (!opp) throw new NotFoundException(`opportunity ${id} not found`);
    if (opp.tenderId || opp.executionType === 'tender') {
      throw new BadRequestException('this is a tender-route deal — its pre-award is managed by the tender, not a direct package');
    }
    const pkg = await this.packages.openDirect({ tenantId: ctx.tenantId, companyId: opp.companyId, opportunityId: id, createdBy: ctx.actorId });
    return { tenantId: ctx.tenantId, companyId: opp.companyId, packageId: pkg.id };
  }

  @Post(':id/pre-award-package/open')
  async open(@Param('id', ParseUuidOr404Pipe) id: string) {
    const { tenantId, packageId } = await this.ensurePackage(id);
    return { packageId, governance: await this.packages.governance(tenantId, id) };
  }

  @Get(':id/pre-award-package')
  async read(@Param('id', ParseUuidOr404Pipe) id: string) {
    const ctx = this.tenant.get();
    const opp = await this.opportunities.get(id);
    if (!opp) throw new NotFoundException(`opportunity ${id} not found`);
    const [aggregate, quotations] = await Promise.all([
      this.packages.readAggregate(ctx.tenantId, id),
      this.quotations.list({ tenantId: ctx.tenantId, sourceOpportunityId: id }),
    ]);
    // The deal shape the UI needs to know whether the package chain even applies (tender-route deals
    // are quoted through their tender, not a direct package).
    const deal = { executionType: opp.executionType, tenderId: opp.tenderId, stage: opp.stage };
    // Commercial users need the study gate, not the engineering content. Full study content is
    // available only through the explicitly protected crm.study.read endpoint below.
    const { studies, ...commercial } = aggregate;
    const studyRevisions = studies.map((study) => ({
      id: study.id, revisionNo: study.revisionNo, status: study.status, inputRevision: study.inputRevision,
    }));
    return { ...commercial, studies: studyRevisions, quotations, deal };
  }

  // ── Governed technical-study workspace ───────────────────────────────────────────────────────

  @Get(':id/pre-award-package/studies')
  @Permissions('crm.study.read')
  async listStudies(@Param('id', ParseUuidOr404Pipe) id: string) {
    const ctx = this.tenant.get();
    const opp = await this.opportunities.get(id);
    if (!opp) throw new NotFoundException(`opportunity ${id} not found`);
    const aggregate = await this.packages.readAggregate(ctx.tenantId, id);
    return aggregate.studies;
  }

  @Get(':id/pre-award-package/reviewers')
  @Permissions('crm.study.read')
  async listStudyReviewers(@Param('id', ParseUuidOr404Pipe) id: string) {
    const ctx = this.tenant.get();
    const opp = await this.opportunities.get(id);
    if (!opp) throw new NotFoundException(`opportunity ${id} not found`);
    if (opp.tenderId || opp.executionType === 'tender') {
      throw new BadRequestException('this is a tender-route deal — its technical review is managed by the tender');
    }
    await this.users.ensureTenant(ctx.tenantId);
    return this.users
      .list(ctx.tenantId)
      .filter((user) => user.active)
      .filter((user) => this.access.can(user.userId, this.reviewerTarget(ctx.tenantId, opp.companyId)).allowed)
      .map((user) => ({ userId: user.userId, displayName: user.displayName, email: user.email ?? null }));
  }

  /**
   * The persisted Sales enquiry projected into the study workspace. The Lead remains the source;
   * the Opportunity's stored leadId selects it, so no caller-provided relation can swap the brief.
   */
  @Get(':id/pre-award-package/intake-context')
  @Permissions('crm.study.read')
  async intakeContext(@Param('id', ParseUuidOr404Pipe) id: string) {
    const opportunity = await this.opportunities.get(id);
    if (!opportunity) throw new NotFoundException(`opportunity ${id} not found`);
    if (!opportunity.leadId) return null;
    const lead = await this.leads.get(opportunity.leadId);
    if (!lead) throw new NotFoundException(`source enquiry ${opportunity.leadId} not found`);
    return {
      leadId: lead.id,
      customerContact: lead.name,
      contactEmail: lead.email,
      contactPhone: lead.phone,
      companyName: lead.companyName,
      requirement: lead.requirement,
      systems: (lead.systems ?? []).map((key) => ({ key, label: elvSystemLabel(key) })),
      sector: lead.sector,
      projectName: lead.projectName,
      projectLocation: lead.projectLocation,
      consultant: lead.consultant,
      mainContractor: lead.mainContractor,
      estimatedValue: lead.estimatedValue,
      projectStage: lead.projectStage,
      expectedTimeline: lead.expectedTimeline,
      nextActivityDue: lead.nextActivityDue,
      salesOwnerId: lead.assignedTo,
      source: lead.source,
    };
  }

  @Get(':id/pre-award-package/evidence')
  @Permissions('crm.study.read')
  async listStudyEvidence(@Param('id', ParseUuidOr404Pipe) id: string) {
    await this.ensurePackage(id);
    const opportunity = await this.opportunities.get(id);
    if (!opportunity) throw new NotFoundException(`opportunity ${id} not found`);
    const actor = this.documentActor();
    const [direct, salesIntake] = await Promise.all([
      this.dms.listFor({ aggregateType: 'crm.opportunity', aggregateId: id, limit: 200 }, actor),
      opportunity.leadId
        ? this.dms.listFor({ aggregateType: 'crm.lead', aggregateId: opportunity.leadId, limit: 200 }, actor)
        : Promise.resolve([]),
    ]);
    return [
      ...salesIntake.map((document) => ({ ...document, source: 'sales-intake' as const })),
      ...direct.map((document) => ({ ...document, source: 'technical-study' as const })),
    ];
  }

  @Post(':id/pre-award-package/evidence')
  @Permissions('crm.study.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async uploadStudyEvidence(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() body: { category?: string; title?: string },
    @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const { tenantId, companyId } = await this.ensurePackage(id);
    const categories = ['drawing', 'client_specification', 'client_requirement', 'authority_requirement', 'site_survey', 'technical_reference'];
    if (!body.category || !categories.includes(body.category)) throw new BadRequestException('choose a valid study evidence category');
    if (!body.title?.trim() || body.title.length > 240) throw new BadRequestException('an evidence title of up to 240 characters is required');
    if (!file?.buffer.length) throw new BadRequestException('choose a file to upload');
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated study author is required');
    return this.dms.createDocument({
      tenantId, companyId, kind: body.category, title: body.title.trim(),
      aggregateType: 'crm.opportunity', aggregateId: id, createdBy: actorId,
    }, {
      fileName: file.originalname.split(/[\\/]/).pop() || 'study-evidence',
      contentType: file.mimetype || 'application/octet-stream',
      data: file.buffer,
    });
  }

  @Post(':id/pre-award-package/evidence/:documentId/versions')
  @Permissions('crm.study.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async addStudyEvidenceVersion(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('documentId', ParseUuidOr404Pipe) documentId: string,
    @Body() body: { note?: string },
    @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    await this.ensurePackage(id);
    if (!file?.buffer.length) throw new BadRequestException('choose a file for the new revision');
    const resolved = await this.dms.getFor(documentId, this.documentActor());
    if (resolved.document.aggregateType === 'crm.lead') {
      throw new BadRequestException('Sales intake evidence is read-only here; Sales maintains its revisions on the source enquiry');
    }
    if (resolved.document.aggregateType !== 'crm.opportunity' || resolved.document.aggregateId !== id) {
      throw new BadRequestException('study evidence must belong to this opportunity');
    }
    return this.dms.addVersion(documentId, {
      fileName: file.originalname.split(/[\\/]/).pop() || 'study-evidence',
      contentType: file.mimetype || 'application/octet-stream',
      data: file.buffer,
    }, this.documentActor(), body.note);
  }

  @Post(':id/pre-award-package/studies')
  @Permissions('crm.study.create')
  async createStudy(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: CreateTechnicalStudyDto) {
    const { tenantId, companyId, packageId } = await this.ensurePackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated study author is required');
    await this.assertEligibleReviewer(tenantId, companyId, dto.reviewerId, actorId);
    const content = await this.canonicalizeEvidence(id, toTechnicalStudyContent(dto));
    return this.packages.createTechnicalStudy({
      tenantId, companyId, packageId, opportunityId: id, title: dto.title, inputRevision: dto.inputRevision,
      authorId: actorId, reviewerId: dto.reviewerId, ...content,
    });
  }

  @Patch(':id/pre-award-package/studies/:studyId')
  @Permissions('crm.study.update')
  async updateStudy(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('studyId', ParseUuidOr404Pipe) studyId: string,
    @Body() dto: UpdateTechnicalStudyDto,
  ) {
    const { tenantId, companyId, packageId } = await this.ensurePackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated study author is required');
    if (dto.reviewerId) {
      await this.assertEligibleReviewer(tenantId, companyId, dto.reviewerId, actorId);
    }
    const content = await this.canonicalizeEvidence(id, toTechnicalStudyContent(dto));
    return this.packages.updateTechnicalStudy({
      tenantId, opportunityId: id, packageId, studyId, actorId, expectedUpdatedAt: dto.expectedUpdatedAt,
      patch: { title: dto.title, inputRevision: dto.inputRevision, reviewerId: dto.reviewerId, ...content },
    });
  }

  @Post(':id/pre-award-package/studies/:studyId/submit')
  @Permissions('crm.study.update')
  async submitStudy(@Param('id', ParseUuidOr404Pipe) id: string, @Param('studyId', ParseUuidOr404Pipe) studyId: string) {
    const { tenantId, packageId } = await this.ensurePackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated study author is required');
    return this.packages.submitTechnicalStudy(tenantId, packageId, studyId, actorId);
  }

  @Post(':id/pre-award-package/studies/:studyId/approve')
  @Permissions('crm.study.approve')
  async approveStudy(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('studyId', ParseUuidOr404Pipe) studyId: string,
    @Body() dto: StudyReviewDto,
  ) {
    const { tenantId, packageId } = await this.ensurePackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated reviewer is required');
    return this.packages.approveTechnicalStudy(tenantId, packageId, studyId, actorId, dto?.comment);
  }

  @Post(':id/pre-award-package/studies/:studyId/request-changes')
  @Permissions('crm.study.approve')
  async requestStudyChanges(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('studyId', ParseUuidOr404Pipe) studyId: string,
    @Body() dto: StudyChangesDto,
  ) {
    if (!dto?.comment?.trim()) throw new BadRequestException('review comment is required');
    const { tenantId, packageId } = await this.ensurePackage(id);
    const actorId = this.tenant.get().actorId;
    if (!actorId) throw new BadRequestException('authenticated reviewer is required');
    return this.packages.requestTechnicalStudyChanges(tenantId, packageId, studyId, actorId, dto.comment);
  }

  @Post(':id/pre-award-package/scope')
  async addScope(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AddScopeDto) {
    if (dto.approve) throw new BadRequestException('scope approval is a separate governed command');
    const { tenantId, companyId, packageId } = await this.ensurePackage(id);
    return this.packages.addScopeBasisFromApprovedStudy({ tenantId, companyId, packageId, lines: toBasisLines(dto.lines), createdBy: this.tenant.get().actorId });
  }

  @Post(':id/pre-award-package/estimate')
  async addEstimate(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AddEstimateDto) {
    if (!dto?.basisRevisionId?.trim()) throw new BadRequestException('basisRevisionId is required');
    if (dto.approve) throw new BadRequestException('estimate freeze and approval are separate governed commands');
    const { tenantId, companyId } = await this.ensurePackage(id);
    const ctx = this.tenant.get();
    const pkg = await this.packages.openDirect({ tenantId, companyId, opportunityId: id, createdBy: ctx.actorId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.packages.addEstimate({ tenantId, companyId, packageId: pkg.id, basisRevisionId: dto.basisRevisionId, lines: dto.lines ? toBasisLines(dto.lines) : undefined, buildUps: (dto.buildUps ?? []) as any, createdBy: ctx.actorId });
  }

  /**
   * Edit a DRAFT scope basis — the human half of Accept ≠ Approve. Add, remove or change lines
   * (description, unit, quantity) before approving. Provenance on surviving lines is preserved by the
   * domain, and each changed line is stamped as human-edited. Approved/superseded revisions refuse.
   */
  @Patch(':id/pre-award-package/scope/:basisId/lines')
  async editScopeLines(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('basisId', ParseUuidOr404Pipe) basisId: string,
    @Body() dto: EditScopeLinesDto,
  ) {
    if (!Array.isArray(dto?.lines)) throw new BadRequestException('lines is required');
    const { tenantId, packageId } = await this.ensurePackage(id);
    return this.packages.updateBasisLinesById(tenantId, packageId, basisId, toBasisLines(dto.lines), this.tenant.get().actorId);
  }

  @Post(':id/pre-award-package/scope/:basisId/approve')
  @Permissions('crm.scope.approve')
  async approveScope(@Param('id', ParseUuidOr404Pipe) id: string, @Param('basisId', ParseUuidOr404Pipe) basisId: string) {
    const { tenantId, packageId } = await this.ensurePackage(id);
    return this.packages.approveScopeBasisById(tenantId, packageId, basisId, this.tenant.get().actorId);
  }

  /** The Estimation Workspace read — one estimate + its per-line build-ups + the basis lines they cost. */
  @Get(':id/pre-award-package/estimate/:estimateId')
  async readEstimate(@Param('id', ParseUuidOr404Pipe) id: string, @Param('estimateId', ParseUuidOr404Pipe) estimateId: string) {
    const ctx = this.tenant.get();
    const view = await this.packages.readEstimateWorkspace(ctx.tenantId, id, estimateId);
    if (!view) throw new NotFoundException(`estimate revision ${estimateId} not found`);
    return view;
  }

  /**
   * Edit a DRAFT estimate's per-line resource build-ups (Estimation Workspace). Only a draft may
   * change; the engine recomputes estimatedCost from the resources, so the total is never a typed-in
   * number. Nothing commercial here — profit/margin/selling live in Pricing (Slice 7).
   */
  @Patch(':id/pre-award-package/estimate/:estimateId/build-ups')
  async updateEstimateBuildUps(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('estimateId', ParseUuidOr404Pipe) estimateId: string,
    @Body() dto: UpdateBuildUpsDto,
  ) {
    if (!Array.isArray(dto?.buildUps)) throw new BadRequestException('buildUps is required');
    const { tenantId, companyId, packageId } = await this.ensurePackage(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.packages.updateEstimateBuildUps({ tenantId, companyId, packageId, estimateId, buildUps: dto.buildUps as any, actorId: this.tenant.get().actorId });
  }

  @Post(':id/pre-award-package/estimate/:estimateId/freeze')
  async freezeEstimate(@Param('id', ParseUuidOr404Pipe) id: string, @Param('estimateId', ParseUuidOr404Pipe) estimateId: string) {
    const { tenantId, packageId } = await this.ensurePackage(id);
    return this.packages.freezeEstimateById(tenantId, packageId, estimateId, this.tenant.get().actorId);
  }

  @Post(':id/pre-award-package/estimate/:estimateId/approve')
  @Permissions('crm.estimate.approve')
  async approveEstimate(@Param('id', ParseUuidOr404Pipe) id: string, @Param('estimateId', ParseUuidOr404Pipe) estimateId: string) {
    const { tenantId, packageId } = await this.ensurePackage(id);
    return this.packages.approveEstimateById(tenantId, packageId, estimateId, this.tenant.get().actorId);
  }

  /**
   * Freeze pricing. A cost-only (post-6A) estimate REQUIRES a pricing policy — target margin or markup;
   * a legacy estimate that still carries its own selling decision may be frozen with no policy and is
   * reproduced exactly. The full Pricing Workspace (Target Margin / Markup / Discount) lands in Slice 7.
   */
  @Post(':id/pre-award-package/pricing/freeze')
  async freezePricing(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: FreezePricingDto) {
    const { tenantId, companyId } = await this.ensurePackage(id);
    const ctx = this.tenant.get();
    const policy = dto?.method ? { method: dto.method, percent: Number(dto.percent) || 0 } as PricingPolicy : undefined;
    const sheet = await this.packages.freezePricing({ tenantId, companyId, opportunityId: id, policy, actorId: ctx.actorId });
    return { pricingSheetId: sheet.id, governance: await this.packages.governance(tenantId, id) };
  }

  // ── Pricing Workspace (Slice 7) — draft → set policy → freeze → quotation ──

  /** Open the Pricing Workspace: the open draft, else the current frozen sheet, else a fresh v1 draft. */
  @Post(':id/pre-award-package/pricing/open')
  async openPricing(@Param('id', ParseUuidOr404Pipe) id: string) {
    const { tenantId, companyId } = await this.ensurePackage(id);
    return this.packages.openPricing({ tenantId, companyId, opportunityId: id, actorId: this.tenant.get().actorId });
  }

  /** Open the NEXT pricing revision (P-002…) from the current frozen sheet — explicit re-pricing. */
  @Post(':id/pre-award-package/pricing/revision')
  async openPricingRevision(@Param('id', ParseUuidOr404Pipe) id: string) {
    const { tenantId, companyId } = await this.ensurePackage(id);
    return this.packages.openPricingRevision({ tenantId, companyId, opportunityId: id, actorId: this.tenant.get().actorId });
  }

  /** Live preview — the selling figures for a policy on the current cost baseline. Pure, no write. */
  @Post(':id/pre-award-package/pricing/preview')
  async previewPricing(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: PricingPolicyDto) {
    if (!dto?.method) throw new BadRequestException('a pricing method (target_margin | markup) is required');
    const { tenantId } = await this.ensurePackage(id);
    return this.packages.previewPricing({ tenantId, opportunityId: id, policy: { method: dto.method, percent: Number(dto.percent) || 0 }, discount: toDiscount(dto) });
  }

  /** The Pricing Workspace read — the sheet + its read-only cost baseline + editable flag. */
  @Get(':id/pre-award-package/pricing/:sheetId')
  async readPricing(@Param('id', ParseUuidOr404Pipe) id: string, @Param('sheetId', ParseUuidOr404Pipe) sheetId: string) {
    const ctx = this.tenant.get();
    const view = await this.packages.readPricingWorkspace(ctx.tenantId, id, sheetId);
    if (!view) throw new NotFoundException(`pricing sheet ${sheetId} not found`);
    return view;
  }

  /** Set the commercial policy on a DRAFT pricing sheet. The engine computes; the UI sends no total. */
  @Patch(':id/pre-award-package/pricing/:sheetId/policy')
  async setPricingPolicy(@Param('id', ParseUuidOr404Pipe) id: string, @Param('sheetId', ParseUuidOr404Pipe) sheetId: string, @Body() dto: PricingPolicyDto) {
    if (!dto?.method) throw new BadRequestException('a pricing method (target_margin | markup) is required');
    const { tenantId } = await this.ensurePackage(id);
    return this.packages.setPricingPolicy({ tenantId, opportunityId: id, sheetId, policy: { method: dto.method, percent: Number(dto.percent) || 0 }, discount: toDiscount(dto) });
  }

  /** Freeze a DRAFT pricing sheet — the commercial commitment. Refuses without a policy. */
  @Post(':id/pre-award-package/pricing/:sheetId/freeze')
  async freezePricingSheet(@Param('id', ParseUuidOr404Pipe) id: string, @Param('sheetId', ParseUuidOr404Pipe) sheetId: string) {
    const { tenantId } = await this.ensurePackage(id);
    const sheet = await this.packages.freezePricingSheetById({ tenantId, opportunityId: id, sheetId, actorId: this.tenant.get().actorId });
    return { pricingSheetId: sheet.id, status: sheet.status, governance: await this.packages.governance(tenantId, id) };
  }
}
