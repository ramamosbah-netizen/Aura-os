import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Id } from '@aura/shared';
import {
  makeQuotationLineEvaluation, mayEvaluate, quantityDeviation, supersede, technicalEligibility,
  type QuantityDeviation, type QuotationLineEvaluation, type TechnicalEligibility, type TechnicalVerdict,
} from './domain/quotation-line-evaluation';
import { QUOTATION_LINE_EVALUATION_STORE, type QuotationLineEvaluationStore } from './quotation-line-evaluation.store';
import { QUOTATION_LINE_STORE, type QuotationLineStore } from './quotation-line.store';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import type { QuotationLine } from './domain/quotation-line';

/**
 * `SUP-01` — the internal technical determination on a supplier's offer.
 *
 * The quotation line records what the supplier says; this records what the company decided. The
 * service exists to keep those apart and to put the REQUIREMENT in front of the decider: an
 * evaluator judging an offer without seeing what was actually asked for is guessing.
 */
@Injectable()
export class QuotationLineEvaluationService {
  private readonly logger = new Logger('TechnicalEvaluation');

  constructor(
    @Inject(QUOTATION_LINE_EVALUATION_STORE) private readonly evaluations: QuotationLineEvaluationStore,
    @Inject(QUOTATION_LINE_STORE) private readonly lines: QuotationLineStore,
    @Inject(PR_LINE_STORE) private readonly prLines: PurchaseRequestLineStore,
  ) {}

  /**
   * WHAT THE EVALUATOR NEEDS IN ORDER TO DECIDE — the requirement, the offer, and where they differ.
   *
   * The quantity deviation is DERIVED here rather than stored, and surfaced rather than acted on: a
   * quantity other than the one requested is a deviation, and whether it is acceptable is the
   * evaluator's judgement. The point is that they cannot miss it.
   */
  async caseFor(tenantId: Id, quotationLineId: Id): Promise<{
    line: QuotationLine;
    requirement: {
      quantity: number | null; uom: string | null;
      specification: string | null; manufacturer: string | null; model: string | null;
    } | null;
    quantityDeviation: QuantityDeviation;
    current: QuotationLineEvaluation | null;
    eligibility: TechnicalEligibility;
    history: QuotationLineEvaluation[];
  }> {
    const line = await this.lines.get(quotationLineId);
    if (!line || line.tenantId !== tenantId) throw new Error(`quotation line ${quotationLineId} not found`);

    const pr = await this.prLines.find(line.prLineId, tenantId);
    const requirement = pr
      ? {
          quantity: Number(pr.quantity),
          // The requirement AS AUTHORED — the snapshot BUY-01 copies onto the line and freezes at
          // submission, so a catalogue edit cannot move the goalposts under an evaluation.
          uom: pr.uom,
          specification: pr.specification,
          manufacturer: pr.manufacturer,
          model: pr.model,
        }
      : null;

    const current = await this.evaluations.findCurrent(tenantId, quotationLineId);
    return {
      line,
      requirement,
      quantityDeviation: quantityDeviation(requirement?.quantity ?? null, line.quantity),
      current,
      eligibility: technicalEligibility(current),
      history: await this.evaluations.listForLine(tenantId, quotationLineId),
    };
  }

  /**
   * Record the verdict.
   *
   * A second verdict on the same offer is an AMENDMENT, not an overwrite: the previous decision is
   * superseded on the record and keeps its own reasoning, because who decided what and when is
   * exactly what an audit of a sourcing decision needs.
   */
  async evaluate(tenantId: Id, input: {
    quotationLineId: Id; verdict: TechnicalVerdict; rationale: string;
    decidedBy: Id; amendmentReason?: string | null;
  }): Promise<QuotationLineEvaluation> {
    const line = await this.lines.get(input.quotationLineId);
    if (!line || line.tenantId !== tenantId) throw new Error(`quotation line ${input.quotationLineId} not found`);

    const permitted = mayEvaluate(line);
    if (!permitted.allowed) throw new Error(permitted.reason);

    const previous = await this.evaluations.findCurrent(tenantId, input.quotationLineId);
    const evaluation = makeQuotationLineEvaluation({
      tenantId,
      companyId: line.companyId,
      quotationLineId: input.quotationLineId,
      verdict: input.verdict,
      rationale: input.rationale,
      decidedBy: input.decidedBy,
      supersedesId: previous?.id ?? null,
      amendmentReason: previous ? input.amendmentReason ?? null : null,
    });

    await this.evaluations.create(evaluation);
    if (previous) {
      const marked = supersede(previous, evaluation.id);
      await this.evaluations.markSuperseded(previous.id, marked.supersededAt as string, evaluation.id);
    }
    this.logger.log(`Offer ${input.quotationLineId} evaluated ${input.verdict} by ${input.decidedBy}`);
    return evaluation;
  }

  /**
   * The Buyer's question: may this offer be considered at all?
   *
   * UNKNOWN when nobody has decided — not eligible, not ineligible, and never a reason to prefer it
   * for being cheap.
   */
  async eligibilityFor(tenantId: Id, quotationLineId: Id): Promise<{
    eligibility: TechnicalEligibility; verdict: TechnicalVerdict | null; decidedBy: Id | null;
  }> {
    const current = await this.evaluations.findCurrent(tenantId, quotationLineId);
    return {
      eligibility: technicalEligibility(current),
      verdict: current?.verdict ?? null,
      decidedBy: current?.decidedBy ?? null,
    };
  }
}
