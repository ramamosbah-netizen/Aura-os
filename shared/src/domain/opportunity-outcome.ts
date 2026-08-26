import type { Id } from './id';
import type { AwardSource, Opportunity, OpportunityStage } from './crm';

/**
 * The deal's LIFECYCLE / OUTCOME state.
 *
 * `stage = 'won'` on its own does NOT say whether a documented award backs the win. A deal closed
 * through the governed chain (an accepted quotation, a tender award) carries provenance —
 * `awardSource`, `awardedQuotationId`, and a `contractedValue` resolved from the accepted Commercial
 * Baseline. A deal marked won by a plain stage edit carries none of that; it is still a legitimate
 * win, but nothing evidences the number.
 *
 * Collapsing those two into one "won" is what let `contractedValue` read 0 on an awarded deal, and it
 * would keep reappearing in health, history and next-action if the distinction were not named once,
 * here. `LEGACY_WON` is therefore not an error state — it is a win whose evidence is missing, and the
 * surfaces are expected to say exactly that rather than either hiding it or treating it as a defect.
 */
export type DealOutcomeState = 'OPEN' | 'GOVERNED_WON' | 'LEGACY_WON' | 'LOST';

/** Stages where the pursuit is over. The single definition — nothing may re-derive this. */
export const TERMINAL_OPPORTUNITY_STAGES: readonly OpportunityStage[] = ['won', 'lost'];

export interface DealOutcome {
  state: DealOutcomeState;
  /** The pursuit is over (won either way, or lost). */
  terminal: boolean;
  /** Won — regardless of whether the award is evidenced. */
  won: boolean;
  /** True ONLY when award provenance exists. The property every money surface must key on. */
  awardDocumented: boolean;
  awardSource: AwardSource | null;
  awardedQuotationId: Id | null;
  /**
   * The authoritative contracted value, or null. Null with `awardDocumented === true` is a real
   * inconsistency and must stay visible — never silently rendered as 0.
   */
  awardValue: number | null;
}

type OutcomeInput = Pick<Opportunity, 'stage' | 'awardSource' | 'awardedQuotationId' | 'contractedValue'>;

export function resolveDealOutcome(opp: OutcomeInput): DealOutcome {
  const won = opp.stage === 'won';
  const lost = opp.stage === 'lost';
  const awardDocumented = won && opp.awardSource != null;
  const state: DealOutcomeState =
    lost ? 'LOST'
    : !won ? 'OPEN'
    : awardDocumented ? 'GOVERNED_WON'
    : 'LEGACY_WON';
  return {
    state,
    terminal: won || lost,
    won,
    awardDocumented,
    awardSource: opp.awardSource ?? null,
    awardedQuotationId: opp.awardedQuotationId ?? null,
    // Only a documented award may speak for the value; a legacy win has no authoritative figure.
    awardValue: awardDocumented ? opp.contractedValue : null,
  };
}

/**
 * The label a user reads. `LEGACY_WON` deliberately carries its caveat in the label: a win with no
 * evidence must never be presented as identical to a governed one.
 */
export const DEAL_OUTCOME_LABEL: Record<DealOutcomeState, string> = {
  OPEN: 'Open',
  GOVERNED_WON: 'Won',
  LEGACY_WON: 'Won — award not evidenced',
  LOST: 'Lost',
};

export function describeDealOutcome(outcome: DealOutcome): string {
  switch (outcome.state) {
    case 'OPEN':
      return 'The pursuit is still open.';
    case 'GOVERNED_WON':
      return `Won through the governed chain (${outcome.awardSource}) — the contracted value comes from the accepted commercial baseline.`;
    case 'LEGACY_WON':
      return 'Won, but no award evidence is recorded — the contracted value is not backed by an accepted quotation or tender award.';
    case 'LOST':
      return 'The pursuit was lost.';
  }
}
