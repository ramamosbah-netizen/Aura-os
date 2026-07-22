import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';
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
import { DOCUMENT_REQUIREMENT_STORE, ParseUuidOr404Pipe, TenantContext, type DocumentRequirementStore } from '@aura/core';

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
@Controller('document-requirements')
export class DocumentRequirementsController {
  constructor(
    @Inject(DOCUMENT_REQUIREMENT_STORE) private readonly store: DocumentRequirementStore,
    private readonly tenant: TenantContext,
  ) {}

  /** Requirements on one record, plus the computed readiness the UI renders. */
  @Get()
  async list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ): Promise<{ requirements: DocumentRequirement[]; readiness: DecisionReadiness }> {
    const requirements = await this.store.list({
      tenantId: this.tenant.get().tenantId,
      entityType,
      entityId,
    });
    return { requirements, readiness: decisionReadiness(requirements) };
  }

  /**
   * Seed the commercial evidence template onto a record.
   *
   * Idempotent by the store's natural-key upsert: running it twice converges on the same set
   * rather than duplicating it, and an already-settled requirement is NOT reset — re-seeding
   * must never quietly un-waive something someone decided.
   */
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
  @Post(':id/evidence')
  async addEvidence(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: AddEvidenceDto,
  ): Promise<DocumentRequirement> {
    const found = await this.require(id);
    const ctx = this.tenant.get();
    let updated: DocumentRequirement;
    try {
      updated = addEvidence(found, { type: dto.type, reference: dto.reference, checkedBy: ctx.actorId ?? null });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'invalid evidence');
    }
    await this.store.upsert(updated);
    return updated;
  }

  /** Waive a requirement. The domain rejects a waiver with no reason — an unattributed one is not a control. */
  @Post(':id/waive')
  async waive(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: WaiveDto): Promise<DocumentRequirement> {
    const found = await this.require(id);
    let updated: DocumentRequirement;
    try {
      updated = waiveRequirement(found, this.tenant.get().actorId ?? null, dto.reason);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'invalid waiver');
    }
    await this.store.upsert(updated);
    return updated;
  }

  /** Mark a requirement as not applying to this deal — excluded from the score entirely. */
  @Post(':id/not-applicable')
  async notApplicable(@Param('id', ParseUuidOr404Pipe) id: string): Promise<DocumentRequirement> {
    const updated = setNotApplicable(await this.require(id));
    await this.store.upsert(updated);
    return updated;
  }

  private async require(id: string): Promise<DocumentRequirement> {
    const found = await this.store.get(id);
    // Tenant is re-checked here, not just at the store: an id from another tenant must read as
    // missing rather than as forbidden.
    if (!found || found.tenantId !== this.tenant.get().tenantId) {
      throw new NotFoundException(`requirement ${id} not found`);
    }
    return found;
  }
}
