import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { Permissions, TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { SourcingRecommendationService, RECOMMENDATION_REASONS, type RecommendationReasonCode } from '@aura/procurement';
import { admitCurrency } from '@aura/shared';

/**
 * SUP-13 — the governed sourcing recommendation.
 *
 * THE MAKER/CHECKER SPLIT IS DECLARED HERE, not inherited. Today the award route carries no explicit
 * permission at all, so the guard derives `procurement.rfq.award` from its path — which the
 * Procurement Manager happens to match and the Buyer happens not to. That the split lands in
 * roughly the right place is luck, not design, and luck is not a control.
 *
 *   procurement.rfq.create / .update   the Buyer prepares and submits
 *   procurement.rfq.award              the Procurement Manager decides
 *
 * The approval matrix is checked on the ACTUAL award value inside the service — each supplier's
 * award and the whole sourcing decision — so an amount beyond somebody's authority cannot be waved
 * through by splitting it into smaller purchase orders.
 */

class PrepareRecommendationDto {
  @IsIn(['single_supplier', 'split_award']) mode!: 'single_supplier' | 'split_award';
  @IsOptional() @IsIn(RECOMMENDATION_REASONS as unknown as string[]) reasonCode?: RecommendationReasonCode | null;
  @IsOptional() @IsString() reason?: string | null;
  @IsOptional() @IsString() comparisonDate?: string;
  @IsOptional() @IsString() baseCurrency?: string;
  /** `[{ offerId, coveredPrLineIds }]` — which supplier supplies which requisition lines. */
  @IsArray() selections!: Array<{ offerId: string; coveredPrLineIds: string[] }>;
}

class DecisionDto {
  @IsIn(['approved', 'rejected', 'returned']) decision!: 'approved' | 'rejected' | 'returned';
  @IsOptional() @IsString() note?: string | null;
}

@Controller('procurement/rfqs')
export class SourcingRecommendationController {
  constructor(
    private readonly recommendations: SourcingRecommendationService,
    private readonly tenant: TenantContext,
  ) {}

  private context(comparisonDate?: string, baseCurrency?: string) {
    const date = (comparisonDate ?? new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('comparisonDate must be a date in YYYY-MM-DD form');
    }
    const verdict = admitCurrency(baseCurrency ?? 'AED');
    if (!verdict.admissible) throw new BadRequestException(verdict.detail);
    return { baseCurrency: verdict.currency, comparisonDate: date };
  }

  /**
   * WHAT AURA ASSEMBLES BEFORE ANYBODY DECIDES.
   *
   * Every supplier's current offer with its comparable values, technical compliance, whole-offer
   * total, validity and terms — and, of each, whether it MAY be recommended and why not. No winner
   * is named and nothing is sorted by price.
   */
  @Permissions('procurement.rfq.read')
  @Get(':rfqId/recommendation/candidates')
  candidates(
    @Param('rfqId', ParseUuidOr404Pipe) rfqId: string,
    @Query('comparisonDate') comparisonDate?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ) {
    return this.recommendations.prepare(this.tenant.get().tenantId, rfqId, this.context(comparisonDate, baseCurrency));
  }

  /** The Buyer's recommendation, as a draft. Refuses anything not recommendable. */
  @Permissions('procurement.rfq.create')
  @Post(':rfqId/recommendation')
  prepare(@Param('rfqId', ParseUuidOr404Pipe) rfqId: string, @Body() dto: PrepareRecommendationDto) {
    if (!Array.isArray(dto?.selections) || dto.selections.length === 0) {
      throw new BadRequestException('a recommendation must choose at least one offer');
    }
    for (const selection of dto.selections) {
      if (!selection?.offerId?.trim()) throw new BadRequestException('each selection must name an offer');
      if (!Array.isArray(selection.coveredPrLineIds) || selection.coveredPrLineIds.length === 0) {
        throw new BadRequestException('each selection must say which requisition lines that supplier covers');
      }
    }
    const ctx = this.tenant.get();
    return this.recommendations.prepareDraft(ctx.tenantId, {
      rfqId,
      companyId: ctx.companyId,
      context: this.context(dto.comparisonDate, dto.baseCurrency),
      mode: dto.mode,
      reasonCode: dto.reasonCode ?? null,
      reason: dto.reason ?? null,
      selections: dto.selections,
      createdBy: ctx.actorId,
    });
  }

  /** The recommendation with its selections, and whether the ground has moved under it. */
  @Permissions('procurement.rfq.read')
  @Get('recommendations/:id')
  read(@Param('id', ParseUuidOr404Pipe) id: string) {
    return this.recommendations.read(this.tenant.get().tenantId, id);
  }

  @Permissions('procurement.rfq.read')
  @Get(':rfqId/recommendations')
  list(@Param('rfqId', ParseUuidOr404Pipe) rfqId: string) {
    return this.recommendations.listByRfq(this.tenant.get().tenantId, rfqId);
  }

  /** The Buyer submits for approval. A stale recommendation is refused rather than submitted. */
  @Permissions('procurement.rfq.update')
  @Post('recommendations/:id/submit')
  submit(@Param('id', ParseUuidOr404Pipe) id: string) {
    const ctx = this.tenant.get();
    return this.recommendations.submit(ctx.tenantId, id, ctx.actorId);
  }

  /**
   * The Procurement Manager decides. `procurement.rfq.award` — a Buyer does not hold it, and the
   * service additionally refuses a submitter approving their own recommendation.
   */
  @Permissions('procurement.rfq.award')
  @Post('recommendations/:id/decision')
  decide(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: DecisionDto) {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new BadRequestException('a decision must be attributable to a person');
    return this.recommendations.decide(ctx.tenantId, id, {
      decision: dto.decision, note: dto.note ?? null, actorId: ctx.actorId,
    });
  }
}
