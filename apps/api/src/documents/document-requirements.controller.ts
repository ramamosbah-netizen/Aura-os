import { BadRequestException, ConflictException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Optional, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  COMMERCIAL_EVIDENCE_TEMPLATE,
  DOCUMENT_REQUIREMENT_TYPES,
  addEvidence,
  decisionReadiness,
  makeDocumentRequirement,
  setNotApplicable,
  waiveRequirement,
  type DecisionReadiness,
  type DocumentEvidenceType,
  type DocumentRequirement,
  type DocumentRequirementType,
} from '@aura/shared';
import { DOCUMENT_REQUIREMENT_STORE, DerivedEvidenceRegistry, ParseUuidOr404Pipe, Permissions, TenantContext, type DocumentRequirementStore } from '@aura/core';
import { QuotationService } from '@aura/crm';

const EVIDENCE_TYPES = ['DOCUMENT_ID', 'EXTERNAL_REFERENCE', 'TRANSMITTAL', 'MANUAL_CONFIRMATION'];

class SeedDto {
  @IsString() entityType!: string;
  @IsString() entityId!: string;
}

class AddEvidenceDto {
  @IsIn(EVIDENCE_TYPES) type!: DocumentEvidenceType;
  @IsString() reference!: string;
}

class WaiveDto {
  @IsString() reason!: string;
}

class CreateRequirementDto {
  @IsString() entityType!: string;
  @IsString() entityId!: string;
  @IsIn(DOCUMENT_REQUIREMENT_TYPES as readonly string[]) type!: DocumentRequirementType;
  @IsOptional() @IsInt() @Min(1) requiredCount?: number;
  @IsOptional() @IsString() note?: string;
}

/**
 * Document evidence requirements — what a decision needs, and whether it has been produced.
 *
 * Separate from the DMS document routes on purpose: a requirement is an OBLIGATION on a record,
 * a document is a file. Conflating them is how "attach a file" quietly becomes "the decision is
 * ready", which is the confusion this whole layer exists to prevent.
 */
// Root path, NOT documents/requirements: `GET /documents/:id` is registered by DocumentsController
// and would swallow it — "requirements" is not a uuid, so the pipe answered 404. Depending on
// controller registration ORDER to disambiguate would be an invisible coupling. The path is also
// truer this way: a requirement is an obligation on a business record, not a sub-resource of a file.
/**
 * DECLARED, BECAUSE THE DERIVED NAME BELONGED TO NOBODY (SEC-01).
 *
 * These routes carried no `@Permissions`, so the guard derived
 * `document-requirements.document-requirement.read` from the path — a name in no role's vocabulary.
 * Measured on a live commercial journey: the estimator who must ASSEMBLE the evidence and the
 * commercial manager who must APPROVE on it were both refused 403 reading the checklist, while an
 * administrator saw it. The evidence gate for every commercial approval in AURA was visible only
 * to somebody with no part in the decision.
 *
 * `documents.requirement.read` is satisfied by `documents.*.read`, which STAFF_BASE already gives
 * every staff role: chasing outstanding evidence is everybody's job, and a checklist nobody can
 * see is a checklist nobody can clear.
 *
 * The writes are split, because they are not one authority. `manage` states what a decision needs
 * and records that evidence exists. `waive` says a requirement will not be met and the decision
 * proceeds anyway — that is an exception to a control, and it belongs with the people who answer
 * for the decision rather than with whoever is assembling the file.
 */
@Controller('document-requirements')
export class DocumentRequirementsController {
  constructor(
    @Inject(DOCUMENT_REQUIREMENT_STORE) private readonly store: DocumentRequirementStore,
    private readonly tenant: TenantContext,
    // To learn who PREPARED a quotation, so they cannot excuse its evidence.
    //
    // THE EXPLICIT @Inject IS LOAD-BEARING. Without it, `QuotationService | null` is reflected as
    // `Object`, Nest cannot resolve the token, and @Optional() turns that failure into a silent
    // null — so `preparedBy` returned null, the domain applied no preparer check, and a live run
    // measured the offer's own preparer waiving (201) and excluding (201) their own supplier
    // evidence while every unit test passed. The same shape as quotation.service.ts's own
    // optional dependencies, which inject by explicit token for exactly this reason.
    @Optional() @Inject(QuotationService) private readonly quotations: QuotationService | null = null,
    // Requirements whose evidence is COMPUTED — a tender offer's supplier quotations. Shown as they
    // are now, and never attachable by hand. Explicit token, for the reason written above.
    @Optional() @Inject(DerivedEvidenceRegistry) private readonly derived: DerivedEvidenceRegistry | null = null,
  ) {}

  /** Requirements on one record, plus the computed readiness the UI renders. */
  @Permissions('documents.requirement.read')
  @Get()
  async list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ): Promise<{ requirements: DocumentRequirement[]; readiness: DecisionReadiness }> {
    const stored = await this.store.list({
      tenantId: this.tenant.get().tenantId,
      entityType,
      entityId,
    });
    // The same overlay the approval gate applies, so the checklist a person reads is the checklist
    // the approval will be decided on — not a stored copy that the decision would then contradict.
    const requirements = this.derived ? await this.derived.overlay(stored) : stored;
    return { requirements, readiness: decisionReadiness(requirements) };
  }

  /**
   * Seed the commercial evidence template onto a record.
   *
   * Idempotent by the store's natural-key upsert: running it twice converges on the same set
   * rather than duplicating it, and an already-settled requirement is NOT reset — re-seeding
   * must never quietly un-waive something someone decided.
   */
  @Permissions('documents.requirement.manage')
  @Post('seed')
  async seed(@Body() dto: SeedDto): Promise<DocumentRequirement[]> {
    const tenantId = this.tenant.get().tenantId;
    const existing = await this.store.list({ tenantId, entityType: dto.entityType, entityId: dto.entityId });
    const settled = new Set(existing.filter((r) => r.status !== 'REQUIRED').map((r) => r.type));

    for (const t of COMMERCIAL_EVIDENCE_TEMPLATE) {
      if (settled.has(t.type)) continue;
      const already = existing.find((r) => r.type === t.type);
      if (already) continue;
      await this.store.upsert(
        makeDocumentRequirement({
          tenantId,
          entityType: dto.entityType,
          entityId: dto.entityId,
          type: t.type,
          requiredCount: t.requiredCount,
        }),
      );
    }
    return this.store.list({ tenantId, entityType: dto.entityType, entityId: dto.entityId });
  }

  /** Add an explicit requirement beyond the template (a warranty letter this client insists on). */
  @Permissions('documents.requirement.manage')
  @Post()
  async create(@Body() dto: CreateRequirementDto): Promise<DocumentRequirement> {
    const requirement = makeDocumentRequirement({
      tenantId: this.tenant.get().tenantId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      type: dto.type,
      requiredCount: dto.requiredCount,
      note: dto.note ?? null,
    });
    await this.store.upsert(requirement);
    return requirement;
  }

  /**
   * Record one piece of evidence. The requirement only flips to PROVIDED once ENOUGH exists —
   * one of three vendor quotes is still a gap, and the domain enforces that, not this controller.
   */
  @Permissions('documents.requirement.manage')
  @Post(':id/evidence')
  async addEvidence(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: AddEvidenceDto,
  ): Promise<DocumentRequirement> {
    const found = await this.require(id);
    const ctx = this.tenant.get();
    /**
     * A COMPUTED REQUIREMENT CANNOT BE TYPED IN. For a tender offer, "three supplier quotations"
     * is established by the supplier quotations themselves — independent suppliers, confirmed
     * revisions, technically judged, commercially compared, across the whole supply scope. A
     * reference typed here would be three files to please a checklist, which is the thing the rule
     * exists to refuse. What remains open is the exception: a reasoned waiver by the decision-maker.
     */
    if (this.derived && await this.derived.isDerived(found)) {
      throw new ConflictException(
        `${found.type} on this record is not allowed for hand-attached evidence — it is computed from its governed supplier quotations; ` +
          'an unmet requirement is excused only by a reasoned waiver from the person who answers for the decision',
      );
    }
    let updated: DocumentRequirement;
    try {
      updated = addEvidence(found, { type: dto.type, reference: dto.reference, checkedBy: ctx.actorId ?? null });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'invalid evidence');
    }
    await this.store.upsert(updated);
    return updated;
  }

  /**
   * Who prepared the decision a requirement belongs to — the one person who may not excuse its
   * evidence. Resolved from the record itself, never from the request.
   *
   * Only `crm.quotation` has a preparer rule today, and that is stated rather than implied: every
   * other entity type returns null, which means the domain applies no preparer check to it. When
   * another decision type gains one, it is added here, next to this one, where it can be seen.
   */
  private async preparedBy(requirement: DocumentRequirement): Promise<string | null> {
    if (requirement.entityType === 'crm.quotation' && this.quotations) {
      const quotation = await this.quotations.get(requirement.entityId);
      return quotation?.createdBy ?? null;
    }
    return null;
  }

  /** The preparer refusal is an AUTHORIZATION failure and says so; anything else is bad input. */
  private asHttp(err: unknown, fallback: string): never {
    const message = err instanceof Error ? err.message : fallback;
    if (/^access denied/i.test(message)) throw new ForbiddenException(message);
    throw new BadRequestException(message);
  }

  /** Waive a requirement. The domain rejects a waiver with no reason — an unattributed one is not a control. */
  @Permissions('documents.requirement.waive')
  @Post(':id/waive')
  async waive(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: WaiveDto): Promise<DocumentRequirement> {
    const found = await this.require(id);
    let updated: DocumentRequirement;
    try {
      updated = waiveRequirement(found, this.tenant.get().actorId ?? null, dto?.reason, new Date(), {
        preparedBy: await this.preparedBy(found),
      });
    } catch (err) {
      this.asHttp(err, 'invalid waiver');
    }
    await this.store.upsert(updated);
    return updated;
  }

  /**
   * Mark a requirement as not applying to this decision — excluded from the score entirely, which
   * makes it a waiver by another name. It used to take no body at all: see `setNotApplicable`.
   */
  @Permissions('documents.requirement.waive')
  @Post(':id/not-applicable')
  async notApplicable(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: WaiveDto): Promise<DocumentRequirement> {
    const found = await this.require(id);
    let updated: DocumentRequirement;
    try {
      updated = setNotApplicable(found, this.tenant.get().actorId ?? null, dto?.reason, new Date(), {
        preparedBy: await this.preparedBy(found),
      });
    } catch (err) {
      this.asHttp(err, 'invalid exclusion');
    }
    await this.store.upsert(updated);
    return updated;
  }

  private async require(id: string): Promise<DocumentRequirement> {
    // The store is tenant-scoped now (N-08), so this is one check rather than two.
    const found = await this.store.get(id, this.tenant.get().tenantId);
    if (!found) {
      throw new NotFoundException(`requirement ${id} not found`);
    }
    return found;
  }
}
