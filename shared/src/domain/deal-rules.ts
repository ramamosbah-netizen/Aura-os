import type { DealFacts } from './deal-facts';

/**
 * Deterministic rules over DealFacts.
 *
 *   Raw data -> DealFacts -> THESE RULES -> Assessment/Findings -> UI
 *
 * Pure functions, `DealFacts -> conclusion`. No I/O, no React, no wording, no hrefs, colours or
 * component concepts, and NO fallback to raw Opportunity fields — if a fact is absent, the rule says
 * so honestly rather than reaching around the contract for it.
 *
 * Rules emit CODES. Turning a code into a sentence, an icon or a click handler is the UI's job;
 * that separation is what stops the same threshold being re-invented in three components.
 */

/** A fact the deal is missing. A code — the UI owns the label. */
export type MissingFactKey =
  | 'BUDGET' | 'AUTHORITY' | 'NEED' | 'TIMELINE'
  | 'STAKEHOLDERS' | 'NEXT_ACTION' | 'CLOSE_DATE';

/**
 * The facts absent from a live pursuit.
 *
 * CHARACTERIZED from the previous client rule: it only ran while the deal was open, and treated
 * anything not confirmed as missing. A closed deal returns [] — its unanswered questions are history,
 * not work. A qualification dimension counts as missing unless it is CONFIRMED, so a future CONCERN
 * or BLOCKER also reads as "not confirmed" rather than being mistaken for an answer.
 */
export function missingFacts(facts: DealFacts): MissingFactKey[] {
  if (facts.outcome.terminal) return [];
  const status = (key: string): string | undefined =>
    facts.qualification.dimensions.find((d) => d.key === key)?.status;
  const out: MissingFactKey[] = [];
  if (status('budget') !== 'CONFIRMED') out.push('BUDGET');
  if (status('authority') !== 'CONFIRMED') out.push('AUTHORITY');
  if (status('need') !== 'CONFIRMED') out.push('NEED');
  if (status('timeline') !== 'CONFIRMED') out.push('TIMELINE');
  if (facts.stakeholders.count === 0) out.push('STAKEHOLDERS');
  if (!facts.engagement.nextOpenActivity) out.push('NEXT_ACTION');
  if (!facts.lifecycle.expectedCloseDate) out.push('CLOSE_DATE');
  return out;
}

/** The single most valuable next move. A code — the UI owns the wording and the action. */
export type NextBestActionKey =
  | 'WORK_NEXT_STEP'
  | 'QUALIFY'
  | 'MAP_DECISION_MAKER'
  | 'LOG_NEXT_STEP'
  | 'GENERATE_QUOTATION'
  | 'CONVERT_TO_CONTRACT'
  | 'NONE';

/**
 * Pick one next action.
 *
 * OPEN deals: CHARACTERIZED — the previous client rule's order and its `< 2 confirmed` threshold are
 * preserved exactly.
 *
 * WON deals: SEMANTIC CORRECTION, deliberate and separately tested. The old rule prompted
 * "Generate quotation" for ANY won deal on a non-tender route — including a deal won *because* its
 * quotation was accepted, which already has one. That is the same defect class as the insights rail
 * congratulating a deal with no PO: a prompt that contradicts the record. Now:
 *   - award documented + no contract -> CONVERT_TO_CONTRACT (a real capability that exists today)
 *   - award documented + contract    -> NONE (the chain is complete as far as this system can tell)
 *   - won WITHOUT provenance         -> GENERATE_QUOTATION, the old behaviour, which was only ever
 *                                       sensible for exactly this case
 *
 * It deliberately does NOT propose capturing a customer PO/LOA: `awardEvidence.customerPoOrLoa` is
 * NOT_CAPTURED, so AURA has nowhere to record one. Recommending an action the system cannot perform
 * would be inventing capability.
 */
export function nextBestAction(facts: DealFacts): NextBestActionKey {
  if (!facts.outcome.terminal) {
    if (facts.engagement.nextOpenActivity) return 'WORK_NEXT_STEP';
    if (facts.qualification.confirmed < 2) return 'QUALIFY';
    if (facts.stakeholders.count === 0) return 'MAP_DECISION_MAKER';
    return 'LOG_NEXT_STEP';
  }
  if (facts.outcome.won) {
    if (facts.outcome.awardDocumented) {
      return facts.downstream.contract.exists ? 'NONE' : 'CONVERT_TO_CONTRACT';
    }
    // `requiresTender` is the RAW flag the old rule read. Using the derived `route` here would be a
    // silent behaviour change, because the two notions can disagree (see DealFacts.lifecycle).
    if (!facts.lifecycle.requiresTender) return 'GENERATE_QUOTATION';
  }
  return 'NONE';
}

/**
 * Whether to nudge "won but not yet quoted/contracted".
 *
 * Migrated from the 360 client so award provenance is read from the lifecycle resolver instead of a
 * locally-passed outcome object. Never fires for a documented award: that deal IS quoted and priced.
 */
export function shouldPromptQuoteOnWon(facts: DealFacts): boolean {
  return facts.outcome.won && !facts.outcome.awardDocumented && facts.downstream.contract.value === null;
}
