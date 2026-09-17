import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Permissions, TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { QuotationLineEvaluationService } from '@aura/procurement';

/**
 * `SUP-01` — the internal technical determination on a supplier's offer.
 *
 * TWO SURFACES, GOVERNED SEPARATELY, because the frozen roles hold disjoint permissions and the
 * guard requires ALL of them rather than any:
 *
 *   THE EVALUATOR'S surface (`engineering.*`) — the requirement, the offer, where they differ, and
 *   the decision. In the shipped catalogue only the Technical Manager holds this, which is the
 *   separation `SUP-01` names: the Buyer records offers and does not decide compliance.
 *
 *   THE BUYER'S surface (`procurement.rfq.read`) — eligibility only. A buyer needs to know whether
 *   an offer may be considered; they do not need, and should not have, the power to decide it.
 *
 * Governing the decision with a procurement permission would have made it impossible for the role
 * that actually decides — the Technical Manager holds no procurement permission at all.
 */

class EvaluateDto {
  @IsIn(['compliant', 'compliant_with_deviation', 'non_compliant'])
  verdict!: 'compliant' | 'compliant_with_deviation' | 'non_compliant';
  @IsString() rationale!: string;
  /** Required when a verdict already exists — the previous decision is superseded, not erased. */
  @IsOptional() @IsString() amendmentReason?: string | null;
}

@Controller('procurement/quotation-lines')
export class TechnicalEvaluationController {
  constructor(
    private readonly evaluations: QuotationLineEvaluationService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * THE WORK WAITING FOR THIS EVALUATOR — offers on a quotation with no verdict yet.
   *
   * This is the handoff into the technical authority: the Buyer records what suppliers offered, and
   * the offers arrive here for a decision. Derived from the absence of a verdict, so nothing can
   * claim to be pending while a decision exists.
   */
  @Permissions('engineering.technical-evaluation.decide')
  @Get('awaiting/:quotationId')
  awaiting(@Param('quotationId', ParseUuidOr404Pipe) quotationId: string) {
    return this.evaluations.awaitingEvaluation(this.tenant.get().tenantId, quotationId);
  }

  /** Everything the decider needs: the requirement as authored, the offer, and the deviation. */
  @Permissions('engineering.technical-evaluation.decide')
  @Get(':id/evaluation')
  caseFor(@Param('id', ParseUuidOr404Pipe) id: string) {
    return this.evaluations.caseFor(this.tenant.get().tenantId, id);
  }

  @Permissions('engineering.technical-evaluation.decide')
  @Post(':id/evaluation')
  evaluate(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: EvaluateDto) {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new BadRequestException('a signed-in user is required to record a technical verdict');
    return this.evaluations.evaluate(ctx.tenantId, {
      quotationLineId: id,
      verdict: dto.verdict,
      rationale: dto.rationale,
      decidedBy: ctx.actorId,
      amendmentReason: dto.amendmentReason ?? null,
    });
  }

  /**
   * May this offer be considered at all?
   *
   * `unknown` when nobody has decided — never a reason to prefer an offer for being cheap.
   */
  @Permissions('procurement.rfq.read')
  @Get(':id/eligibility')
  eligibility(@Param('id', ParseUuidOr404Pipe) id: string) {
    return this.evaluations.eligibilityFor(this.tenant.get().tenantId, id);
  }
}
