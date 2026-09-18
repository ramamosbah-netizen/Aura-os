import { moneyNumber, type Id } from '@aura/shared';
import { newId } from '@aura/shared';
import type { NormalisedCommercialValue } from './commercial-normalisation';

/**
 * SUP-13 — the governed sourcing recommendation.
 *
 * AURA DOES NOT NAME A WINNER. It assembles eligible offers, comparable values, technical
 * compliance, deviations, validity and terms; a Buyer decides, and the decision is recorded with its
 * reason. Choosing an offer that is not the lowest governed total is legitimate and common —
 * single-source coordination, delivery, warranty, project risk — and the record exists to carry that
 * reasoning rather than to prevent it.
 *
 * The frozen shape, and why each part is a refusal rather than a convenience:
 *
 *   RECOMMENDATION IS PER WHOLE OFFER. The line comparison is the EVIDENCE that explains why an
 *   offer is right, and where it is dearer. A per-line cheapest cannot become one purchase order,
 *   and letting it silently become several is precisely the decision nobody would have made.
 *
 *   A SPLIT AWARD IS AN EXPLICIT ACT, with a reason, producing one purchase order per supplier. It
 *   is available because split sourcing is sometimes right, not because the arithmetic drifted there.
 *
 *   COMPLIANCE GOVERNS. An offer whose covered lines are not all technically compliant, or
 *   compliant-with-deviation, is NOT RECOMMENDABLE — an unevaluated line is `unknown`, and unknown
 *   is not permission.
 *
 *   A RECOMMENDATION NAMES ITS REVISION. When a supplier sends Rev 3 after a recommendation was
 *   prepared on Rev 2, it becomes STALE. It never quietly becomes a recommendation of Rev 3: a
 *   decision that re-points at a different price is not a decision anybody made.
 */

export const RECOMMENDATION_MODES = ['single_supplier', 'split_award'] as const;
export type RecommendationMode = (typeof RECOMMENDATION_MODES)[number];

/**
 * `withdrawn` is the maker or the approver standing a recommendation down, and it is its own status
 * rather than a reuse of `rejected`. A rejection is a checker's verdict ON a recommendation — "I
 * looked at this and I will not approve it" — and recording a withdrawal as one would put words in
 * the approver's mouth. It exists because `approved` had nowhere else to go: an approved
 * recommendation that has gone stale cannot be awarded and cannot be decided again, and without a
 * way to stand it down it would block its RFQ for good (migration 0355).
 */
export const RECOMMENDATION_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'returned', 'awarded', 'withdrawn'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/**
 * "a draft" / "an approved" — these statuses appear in refusals a buyer reads, and "a approved
 * recommendation" is the kind of thing that makes somebody trust the rest of the sentence less.
 */
export function aStatus(status: RecommendationStatus): string {
  return `${/^[aeiou]/i.test(status) ? 'an' : 'a'} ${status}`;
}

/** Why an offer was chosen over a cheaper one. Coded so it can be analysed, with text so it reads. */
export const RECOMMENDATION_REASONS = [
  'single_source_coordination',
  'better_delivery',
  'better_warranty',
  'lower_project_risk',
  'technical_preference',
  'commercial_clarification',
  'other',
] as const;
export type RecommendationReasonCode = (typeof RECOMMENDATION_REASONS)[number];

export interface RecommendationSelection {
  id: Id;
  tenantId: Id;
  recommendationId: Id;
  familyId: Id;
  offerId: Id;
  /** The revision this decision was made ON. Never re-pointed. */
  revisionId: Id;
  supplierName: string;
  coveredPrLineIds: Id[];
  /** The governed total AT THE TIME OF THE DECISION. NULL is UNKNOWN and is never a zero. */
  governedTotal: number | null;
  governedTotalBasis: string | null;
  technicalStatus: string | null;
  commercialStatus: string | null;
  createdAt: string;
}

export interface SourcingRecommendation {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  rfqId: Id;
  comparisonDate: string;
  comparisonCurrency: string;
  mode: RecommendationMode;
  status: RecommendationStatus;
  reasonCode: RecommendationReasonCode | null;
  reason: string | null;
  createdBy: Id | null;
  createdAt: string;
  submittedBy: Id | null;
  submittedAt: string | null;
  decidedBy: Id | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /**
   * WITHDRAWAL IS A SECOND FACT, NOT A REPLACEMENT FOR THE FIRST (migration 0356).
   *
   * Standing a recommendation down used to be written into `decidedBy` / `decidedAt` /
   * `decisionNote` — the fields that record who APPROVED it. So withdrawing an approved
   * recommendation erased the approval, and afterwards the record said only that somebody had
   * withdrawn it. The approver's act vanished from the one place it was kept.
   *
   * Both are kept now: "approved by X on the 10th, stood down by Y on the 14th because the supplier
   * revised their offer" is one story, and it is the story somebody reading it back needs.
   */
  withdrawnBy: Id | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
}

/**
 * THE WHOLE-OFFER COMMERCIAL TOTAL.
 *
 * Where the freight we refused to allocate across lines finally earns its keep: at the offer level
 * it can simply be ADDED, because that is the level the supplier quoted it at. No allocation is
 * invented and none is needed.
 *
 *     known line totals + quotation-level freight = whole-offer total, ex-tax
 *
 * Any unknown input makes the whole total UNKNOWN. A line whose requisition-line total could not be
 * established — a partial offer, a missing rate, an unstated tax treatment — means the offer cannot
 * be priced for the whole requirement, and freight quoted as "to be advised" is not zero freight.
 */
export type WholeOfferTotal =
  | { status: 'known'; value: number; currency: string; comparisonDate: string; taxBasis: 'ex-tax'; includesFreight: boolean }
  | { status: 'unknown'; reason: 'line_total_unknown' | 'freight_not_quantified'; detail: string };

export function wholeOfferTotal(input: {
  lineTotals: NormalisedCommercialValue[];
  freight: NormalisedCommercialValue | null;
  currency: string;
  comparisonDate: string;
}): WholeOfferTotal {
  const { lineTotals, freight, currency, comparisonDate } = input;

  const unknownLine = lineTotals.find((v) => v.status !== 'comparable');
  if (unknownLine && unknownLine.status === 'unknown') {
    return {
      status: 'unknown',
      reason: 'line_total_unknown',
      detail: `the whole-requirement cost of this offer is not known because one of its lines is not: ${unknownLine.reason}`,
    };
  }
  if (lineTotals.length === 0) {
    return {
      status: 'unknown',
      reason: 'line_total_unknown',
      detail: 'this offer prices none of the requirement',
    };
  }

  const lines = lineTotals.reduce((sum, v) => sum + (v.status === 'comparable' ? v.unitValue : 0), 0);

  // Freight NOT QUOTED is a different fact from freight quoted and not yet valued. The first is an
  // offer with no freight charge; the second is an offer whose total nobody can state.
  if (freight === null) {
    return { status: 'known', value: moneyNumber(lines), currency, comparisonDate, taxBasis: 'ex-tax', includesFreight: false };
  }
  if (freight.status !== 'comparable') {
    return {
      status: 'unknown',
      reason: 'freight_not_quantified',
      detail: `freight was quoted but cannot be valued (${freight.reason}), so the whole-offer total is not known — it is NOT zero freight`,
    };
  }
  return {
    status: 'known',
    value: moneyNumber(lines + freight.unitValue),
    currency, comparisonDate, taxBasis: 'ex-tax', includesFreight: true,
  };
}

export type NotRecommendableReason =
  | 'no_effective_revision'
  | 'technical_verdict_missing'
  | 'technically_not_compliant'
  | 'commercial_total_unknown'
  | 'offer_expired'
  | 'requirement_not_covered';

export interface Recommendability {
  recommendable: boolean;
  reasons: Array<{ reason: NotRecommendableReason; detail: string }>;
}

/**
 * MAY THIS OFFER BE RECOMMENDED?
 *
 * `coveredLines` is the scope being recommended — every requisition line for a single-supplier
 * recommendation, or this supplier's share of a split. An offer that fails for the whole requirement
 * may still be perfectly recommendable for part of it, which is the honest way a partial offer
 * enters a split award rather than being treated as a full quotation for the whole requisition.
 */
export function offerRecommendability(input: {
  hasEffectiveRevision: boolean;
  /** SUP-01's verdict per covered line: 'eligible' | 'not_eligible' | 'unknown'. */
  technicalByLine: Record<string, 'eligible' | 'not_eligible' | 'unknown'>;
  coveredPrLineIds: string[];
  wholeTotal: WholeOfferTotal;
  commercialStatus: 'live' | 'expired' | 'validity_unknown';
}): Recommendability {
  const reasons: Recommendability['reasons'] = [];

  if (!input.hasEffectiveRevision) {
    reasons.push({
      reason: 'no_effective_revision',
      detail: 'this supplier has no commercially effective revision — there is no current offer to recommend',
    });
    // Nothing else can be judged without an offer; one reason is the whole answer.
    return { recommendable: false, reasons };
  }

  if (input.coveredPrLineIds.length === 0) {
    reasons.push({ reason: 'requirement_not_covered', detail: 'no requisition line is assigned to this supplier' });
  }

  for (const prLineId of input.coveredPrLineIds) {
    const verdict = input.technicalByLine[prLineId] ?? 'unknown';
    /**
     * UNKNOWN IS NOT PERMISSION. An unevaluated line has not been judged acceptable; it has not been
     * judged at all, and a price cannot substitute for a technical decision however low it is.
     */
    if (verdict === 'unknown') {
      reasons.push({
        reason: 'technical_verdict_missing',
        detail: `requisition line ${prLineId} has no technical verdict on this offer — it cannot be recommended until the Technical Manager decides`,
      });
    } else if (verdict === 'not_eligible') {
      reasons.push({
        reason: 'technically_not_compliant',
        detail: `requisition line ${prLineId} was judged not compliant on this offer`,
      });
    }
  }

  if (input.wholeTotal.status !== 'known') {
    reasons.push({ reason: 'commercial_total_unknown', detail: input.wholeTotal.detail });
  }

  /**
   * AN EXPIRED OFFER IS NOT UNKNOWN — its price is perfectly well known, and the comparison shows it.
   * What has lapsed is permission to act on it. Recommending it needs a fresh revision or an
   * extension from the supplier, and a buyer cannot wave that away on their own.
   */
  if (input.commercialStatus === 'expired') {
    reasons.push({
      reason: 'offer_expired',
      detail: 'this offer has expired — its price is known, but it cannot be recommended until the supplier extends it or sends a new revision',
    });
  }

  return { recommendable: reasons.length === 0, reasons };
}

export interface NewSourcingRecommendation {
  tenantId: Id;
  companyId?: Id | null;
  rfqId: Id;
  comparisonDate: string;
  comparisonCurrency: string;
  mode?: RecommendationMode;
  reasonCode?: RecommendationReasonCode | null;
  reason?: string | null;
  createdBy?: Id | null;
}

export function makeSourcingRecommendation(input: NewSourcingRecommendation): SourcingRecommendation {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.comparisonDate)) {
    throw new Error('a recommendation must record the comparison date it was made on');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    rfqId: input.rfqId,
    comparisonDate: input.comparisonDate,
    comparisonCurrency: input.comparisonCurrency,
    mode: input.mode ?? 'single_supplier',
    status: 'draft',
    reasonCode: input.reasonCode ?? null,
    reason: input.reason?.trim() || null,
    withdrawnBy: null,
    withdrawnAt: null,
    withdrawalReason: null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
    submittedBy: null, submittedAt: null, decidedBy: null, decidedAt: null, decisionNote: null,
  };
}

/**
 * IS THE SCOPE WHOLE AND UNAMBIGUOUS?
 *
 * Every requisition line must be covered exactly once. An omitted line means part of the requirement
 * has no supplier and would be silently dropped from the purchase orders; a line covered twice means
 * two suppliers are being asked to supply the same thing.
 */
export function selectionCoverage(requirementIds: string[], selections: Array<{ coveredPrLineIds: string[] }>): {
  complete: boolean;
  uncovered: string[];
  duplicated: string[];
} {
  const counts = new Map<string, number>();
  for (const selection of selections) {
    for (const id of selection.coveredPrLineIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const uncovered = requirementIds.filter((id) => !counts.has(id));
  const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { complete: uncovered.length === 0 && duplicated.length === 0, uncovered, duplicated };
}

/**
 * IS A REASON REQUIRED?
 *
 * Whenever the chosen offer is not the lowest governed total, and for every split award. Not as
 * friction: a recommendation that departs from the cheapest option is the one a reviewer most needs
 * explained, and an unexplained one is indistinguishable from an error.
 */
export function reasonRequired(input: {
  mode: RecommendationMode;
  chosenTotal: number | null;
  lowestAvailableTotal: number | null;
}): boolean {
  if (input.mode === 'split_award') return true;
  if (input.chosenTotal === null || input.lowestAvailableTotal === null) return false;
  return input.chosenTotal > input.lowestAvailableTotal;
}

export type StaleReason = 'revision_superseded' | 'revision_retired' | 'offer_has_no_current_revision';

export interface Staleness {
  stale: boolean;
  affected: Array<{ offerId: string; supplierName: string; reason: StaleReason; detail: string }>;
}

/**
 * HAS THE GROUND MOVED UNDER THIS RECOMMENDATION?
 *
 * A recommendation names the revision it was made on. When a supplier sends a newer one, or
 * withdraws the one that was recommended, the recommendation does NOT follow — it becomes STALE and
 * asks to be reviewed. Re-pointing it silently would mean approving a price nobody read.
 */
export function recommendationStaleness(
  selections: Array<{ offerId: string; revisionId: string; supplierName: string }>,
  currentEffectiveByOffer: Record<string, { revisionId: string } | null>,
): Staleness {
  const affected: Staleness['affected'] = [];
  for (const selection of selections) {
    const current = currentEffectiveByOffer[selection.offerId] ?? null;
    if (!current) {
      affected.push({
        offerId: selection.offerId, supplierName: selection.supplierName,
        reason: 'offer_has_no_current_revision',
        detail: `${selection.supplierName}'s recommended revision is no longer the current offer, and no revision has replaced it`,
      });
    } else if (current.revisionId !== selection.revisionId) {
      affected.push({
        offerId: selection.offerId, supplierName: selection.supplierName,
        reason: 'revision_superseded',
        detail: `${selection.supplierName} has sent a newer revision since this recommendation was prepared — it was made on a different offer and must be reviewed`,
      });
    }
  }
  return { stale: affected.length > 0, affected };
}
