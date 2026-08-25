import type { Opportunity } from '@aura/shared';

/**
 * The deal's authoritative CONTRACTED VALUE for the Opportunity 360 outcome.
 *
 * When the opportunity carries award provenance (Slice 9 — an accepted quotation drove the win, so
 * `awardSource` is set and `contractedValue` was resolved from the accepted Commercial Baseline
 * subtotal), THAT is the contracted value. It is fixed at the moment of award — never the
 * salesperson's headline `value`, and never conditional on a Contract entity being created later.
 *
 * Only a LEGACY win with no award provenance falls back to the downstream Contract sum. The two are
 * DIFFERENT measures and must not be conflated: a Contract's value can change afterwards via
 * amendments/variations, whereas the award value is the stable record of what was contracted at Won.
 *
 * Local to the 360 read model on purpose — it is a view composition rule, not a general domain rule.
 *
 * When award provenance exists the award value is passed THROUGH, including `null`: a `null` here is
 * a real inconsistency (won via an accepted quotation but no contracted value resolved) and must
 * stay visible — never masked as `0` and never replaced by the downstream contract sum.
 */
export function resolveContractedValue(
  opp: Pick<Opportunity, 'awardSource' | 'contractedValue'>,
  legacyContractSum: number,
): number | null {
  return opp.awardSource != null ? opp.contractedValue : legacyContractSum;
}
