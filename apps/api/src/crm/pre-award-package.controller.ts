import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { type BasisLine, OpportunityService, PreAwardPackageService, QuotationService } from '@aura/crm';
import type { PricingPolicy, PricingDiscount } from '@aura/shared';

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
  @IsString() sourceId!: string;
  @IsOptional() @IsString() sourceRevRef?: string;
  @IsArray() lines!: ScopeLineDto[];
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
  @IsArray() lines!: ScopeLineDto[];
  @IsArray() buildUps!: BuildUpDto[];
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
    private readonly quotations: QuotationService,
    private readonly tenant: TenantContext,
  ) {}

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
    return { ...aggregate, quotations, deal };
  }

  @Post(':id/pre-award-package/scope')
  async addScope(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AddScopeDto) {
    if (!dto?.sourceId?.trim()) throw new BadRequestException('sourceId is required');
    const { tenantId, companyId, packageId } = await this.ensurePackage(id);
    let basis = await this.packages.addScopeBasis({ tenantId, companyId, packageId, sourceId: dto.sourceId, sourceRevRef: dto.sourceRevRef ?? null, lines: toBasisLines(dto.lines), createdBy: this.tenant.get().actorId });
    if (dto.approve) basis = await this.packages.approveScopeBasis(basis, this.tenant.get().actorId);
    return basis;
  }

  @Post(':id/pre-award-package/estimate')
  async addEstimate(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AddEstimateDto) {
    if (!dto?.basisRevisionId?.trim()) throw new BadRequestException('basisRevisionId is required');
    const { tenantId, companyId } = await this.ensurePackage(id);
    const ctx = this.tenant.get();
    const pkg = await this.packages.openDirect({ tenantId, companyId, opportunityId: id, createdBy: ctx.actorId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const built = await this.packages.addEstimate({ tenantId, companyId, packageId: pkg.id, basisRevisionId: dto.basisRevisionId, lines: toBasisLines(dto.lines), buildUps: (dto.buildUps ?? []) as any, createdBy: ctx.actorId });
    let estimate = built.estimate;
    if (dto.approve) { estimate = await this.packages.freezeEstimateRevision(estimate, ctx.actorId); estimate = await this.packages.approveEstimateRevision(estimate, ctx.actorId); }
    return { estimate, buildUps: built.buildUps };
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
