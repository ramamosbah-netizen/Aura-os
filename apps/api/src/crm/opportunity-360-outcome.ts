import type { DealOutcome } from '@aura/shared';

/**
 * The deal's authoritative CONTRACTED VALUE for the Opportunity 360 outcome.
 *
 * Keyed on the LIFECYCLE outcome (`resolveDealOutcome`), never on a locally re-derived notion of
 * "is this awarded" — one definition of award provenance for every surface is the whole point of
 * Phase 0. A GOVERNED_WON deal speaks with its award value (resolved from the accepted Commercial
 * Baseline subtotal, fixed at the moment of award, and never conditional on a Contract entity
 * existing later). Everything else falls back to the downstream Contract sum.
 *
 * The two are DIFFERENT measures and must not be conflated: a Contract's value can change afterwards
 * via amendments/variations, whereas the award value is the stable record of what was contracted at
 * Won. A LEGACY_WON deal (won with no provenance) has no authoritative award figure at all, so it
 * also uses the contract sum — and the surfaces say the award is not evidenced.
 *
 * `null` passes through: award provenance with no resolved value is a real inconsistency and must
 * stay visible, never masked as 0 or replaced by the contract sum.
 *
 * Local to the 360 read model on purpose — it is a view composition rule, not a general domain rule.
 */
export function resolveContractedValue(outcome: DealOutcome, legacyContractSum: number): number | null {
  return outcome.awardDocumented ? outcome.awardValue : legacyContractSum;
}
