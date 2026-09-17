import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { makeEvent } from '@aura/shared';
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
    @Inject(EVENT_STORE) private readonly events: EventStore,
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

    /**
     * SUPERSEDE FIRST, THEN INSERT — the order is load-bearing, not stylistic.
     *
     * `aura_quo_line_eval_one_current` is a PARTIAL unique index over the rows with no
     * `superseded_at`, so inserting the replacement while the previous verdict is still current puts
     * two current rows on one offer and Postgres rejects it. Creating first and marking second read
     * more naturally and was wrong.
     *
     * It was invisible to the API suite, which runs against in-memory stores with no such
     * constraint, and surfaced only when the browser drove the real database. The constraint did its
     * job: it refused a state where an offer has two standing verdicts.
     */
    if (previous) {
      const marked = supersede(previous, evaluation.id);
      await this.evaluations.markSuperseded(previous.id, marked.supersededAt as string, evaluation.id);
    }
    await this.evaluations.create(evaluation);
    /**
     * THE ACTUAL OUTPUT: the verdict on the spine — who decided what, when, and why.
     *
     * A technical determination that lives only in one module's table is not an output; the reason a
     * sourcing decision can be audited later is that the judgement and its rationale are readable
     * without asking Procurement. It carries the SUPERSEDED id too, so an amendment is legible as an
     * amendment rather than as a second opinion appearing from nowhere.
     */
    await this.events.append([
      makeEvent({
        type: 'procurement.quotation_line.evaluated',
        tenantId,
        companyId: line.companyId,
        actorId: input.decidedBy,
        aggregateType: 'procurement.quotation_line',
        aggregateId: input.quotationLineId,
        payload: {
          quotationLineId: input.quotationLineId,
          prLineId: line.prLineId,
          revisionId: line.revisionId,
          verdict: evaluation.verdict,
          rationale: evaluation.rationale,
          decidedBy: input.decidedBy,
          decidedAt: evaluation.decidedAt,
          supersedesId: evaluation.supersedesId,
          amendmentReason: evaluation.amendmentReason,
        },
      }),
    ]);
    this.logger.log(`Offer ${input.quotationLineId} evaluated ${input.verdict} by ${input.decidedBy}`);
    return evaluation;
  }

  /**
   * OFFERS STILL AWAITING A TECHNICAL VERDICT — the work handed to the evaluator.
   *
   * Derived from the absence of a current evaluation rather than from a status field: an offer is
   * awaiting a decision precisely because nobody has made one, and a separate `pending` flag would
   * be a second way of saying that, free to disagree with the evaluations themselves.
   */
  async awaitingEvaluation(tenantId: Id, revisionId: Id): Promise<QuotationLine[]> {
    const lines = await this.lines.listByRevision(tenantId, revisionId);
    const pending: QuotationLine[] = [];
    for (const line of lines) {
      // A declined line offered nothing, so it is not work for an evaluator.
      if (line.response !== 'quoted') continue;
      if (!(await this.evaluations.findCurrent(tenantId, line.id))) pending.push(line);
    }
    return pending;
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
