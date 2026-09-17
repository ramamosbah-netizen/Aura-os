import { type Id, newId } from '@aura/shared';
import type { QuotationLine } from './quotation-line';

/**
 * `SUP-01` — the INTERNAL technical determination on a supplier's offer.
 *
 * The quotation line records what the supplier SAYS. This records what the company DECIDED, and the
 * two must never be confused: a supplier writing "comply" is a claim with exactly the standing of
 * their price.
 *
 * WHO DECIDES. `SUP-01`'s frozen authority is the Procurement RFQ context with the Technical Manager
 * among its roles, and in the shipped role catalogue only the Technical Manager holds the
 * `engineering.*` this is governed by. The Buyer records offers and does not decide compliance —
 * the catalogue already says of this role that "the engineer who proposed the product must not be
 * the one who approves it".
 *
 * QUALITY'S MAR IS A SEPARATE AUTHORITY, AND THIS CAPABILITY DOES NOT CONSUME IT.
 *
 * A MAR says a make/model is approved for the project. It cannot say whether THIS offer meets THIS
 * requisition line, because the same approved model can be offered with a deviation, a missing
 * accessory or a narrower warranty and so be approved and non-compliant at once.
 *
 * There is no MAR read anywhere on this path, so MAR is NOT evidence this capability uses — it is an
 * authority that stays separate and unconsumed. Calling it "evidence the evaluator consults" would
 * describe a linkage that does not exist. Whether an approved MAR is a precondition for purchasing a
 * given material is UNDETERMINED and deliberately not assumed here: some materials may need no MAR
 * at all, and turning one into a general purchasing precondition would be inventing policy rather
 * than reconciling an authority.
 */

export const TECHNICAL_VERDICTS = ['compliant', 'compliant_with_deviation', 'non_compliant'] as const;
export type TechnicalVerdict = (typeof TECHNICAL_VERDICTS)[number];

export interface QuotationLineEvaluation {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  quotationLineId: Id;
  verdict: TechnicalVerdict;
  /** Required. A verdict nobody explained cannot be reviewed, appealed or put to the supplier. */
  rationale: string;
  decidedBy: Id;
  decidedAt: string;
  supersedesId: Id | null;
  amendmentReason: string | null;
  supersededAt: string | null;
  supersededBy: Id | null;
  createdAt: string;
}

export interface NewQuotationLineEvaluation {
  tenantId: Id;
  companyId?: Id | null;
  quotationLineId: Id;
  verdict: TechnicalVerdict;
  rationale: string;
  decidedBy: Id;
  supersedesId?: Id | null;
  amendmentReason?: string | null;
}

export const RATIONALE_REQUIRED =
  'a technical verdict requires a rationale — a decision nobody explained cannot be reviewed, ' +
  'appealed, or put to the supplier';

export const AMENDMENT_NEEDS_REASON =
  'amending a technical verdict requires a reason: the previous decision is superseded on the record, ' +
  'not erased';

export const CANNOT_EVALUATE_A_DECLINE =
  'this supplier did not offer anything against this requirement, so there is nothing to evaluate ' +
  'technically';

export function makeQuotationLineEvaluation(input: NewQuotationLineEvaluation): QuotationLineEvaluation {
  if (!input.quotationLineId) throw new Error('quotationLineId is required');
  if (!input.decidedBy) throw new Error('decidedBy is required');
  if (!input.rationale?.trim()) throw new Error(RATIONALE_REQUIRED);
  if (input.supersedesId && !input.amendmentReason?.trim()) throw new Error(AMENDMENT_NEEDS_REASON);

  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    quotationLineId: input.quotationLineId,
    verdict: input.verdict,
    rationale: input.rationale.trim(),
    decidedBy: input.decidedBy,
    decidedAt: now,
    supersedesId: input.supersedesId ?? null,
    amendmentReason: input.amendmentReason?.trim() || null,
    supersededAt: null,
    supersededBy: null,
    createdAt: now,
  };
}

/** A declined line offered nothing, so there is nothing to determine about it. */
export function mayEvaluate(line: QuotationLine): { allowed: boolean; reason?: string } {
  if (line.response !== 'quoted') return { allowed: false, reason: CANNOT_EVALUATE_A_DECLINE };
  return { allowed: true };
}

/**
 * IS THIS OFFER TECHNICALLY ELIGIBLE?
 *
 * Three answers, and the third is the one that carries this wave's whole discipline:
 *
 *   ELIGIBLE      somebody with the authority decided it is compliant, or compliant with an
 *                 accepted deviation.
 *   NOT ELIGIBLE  somebody decided it is not.
 *   UNKNOWN       NOBODY HAS DECIDED. Not eligible, not ineligible, and above all not cheap — an
 *                 offer whose compliance nobody has looked at cannot be recommended, however low its
 *                 price. `null` here is the absence of a decision, never a decision.
 *
 * The supplier's own `complianceResponse` is deliberately not consulted. It is an input a human
 * evaluator reads, not a fallback this function may use when no verdict exists.
 */
export type TechnicalEligibility = 'eligible' | 'not_eligible' | 'unknown';

export function technicalEligibility(evaluation: QuotationLineEvaluation | null): TechnicalEligibility {
  if (!evaluation) return 'unknown';
  if (evaluation.supersededAt) return 'unknown';
  return evaluation.verdict === 'non_compliant' ? 'not_eligible' : 'eligible';
}

/**
 * A quantity that differs from the one asked for is a DEVIATION.
 *
 * Not a partial offer and not a refusal: the supplier answered this requirement, and answered it with
 * something other than what was requested. Surfaced to the evaluator as an input rather than decided
 * automatically — whether 10 against a request for 12 is acceptable is a technical judgement, and the
 * point of this function is that the evaluator cannot MISS it, not that it decides for them.
 *
 * DERIVED, never stored. Both numbers already exist — the requisition line's and the offer's — and a
 * third field recording their relationship could disagree with both.
 */
export interface QuantityDeviation {
  deviates: boolean;
  requested: number | null;
  offered: number | null;
  /** Null when either side is unknown: an un-measurable difference is not "no difference". */
  difference: number | null;
}

export function quantityDeviation(requested: number | null, offered: number | null): QuantityDeviation {
  if (requested === null || offered === null) {
    return { deviates: false, requested, offered, difference: null };
  }
  const difference = Number(offered) - Number(requested);
  return { deviates: difference !== 0, requested, offered, difference };
}

/** Mark a verdict superseded by a newer one. The row stays; the audit trail is the point. */
export function supersede(previous: QuotationLineEvaluation, replacementId: Id): QuotationLineEvaluation {
  return { ...previous, supersededAt: new Date().toISOString(), supersededBy: replacementId };
}
