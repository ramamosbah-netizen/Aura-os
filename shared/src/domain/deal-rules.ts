import { opportunityAttention } from './crm';
import { attentionFactsOf, type DealFacts } from './deal-facts';
import type { Finding } from './deal-findings';
import type { AssessmentCoverageInputs } from './deal-assessment';

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

/** Which figure a deal's value came from. The basis travels with the number, never separately. */
export type DealValueBasis = 'AWARD' | 'HEADLINE' | 'NONE';
export interface ResolvedDealValue {
  /** `null` = no figure exists. NOT zero — a real 0 is reported as 0 with its basis. */
  amount: number | null;
  basis: DealValueBasis;
}

/** The minimal facts the value rule needs. Named explicitly so a caller cannot pass a raw record. */
export interface DealValueInputs {
  awardDocumented: boolean;
  awardValue: number | null;
  headlineValue: number | null;
}

export const dealValueInputsOf = (facts: DealFacts): DealValueInputs => ({
  awardDocumented: facts.outcome.awardDocumented,
  awardValue: facts.commercial.awardValue,
  headlineValue: facts.commercial.headlineValue,
});

/**
 * WHICH figure is this deal's value — lifecycle-aware, and deliberately not a blanket swap of one
 * field for another.
 *
 *   documented award -> the AWARD value (excl. VAT), fixed at the moment of award
 *   anything else    -> the HEADLINE forecast, which is all that exists before an award
 *
 * A win with no provenance keeps the headline: there is no authoritative figure to promote, and
 * inventing one would repeat the mistake this whole phase exists to remove. Contract value is NOT
 * consulted here — it is a separate, later-mutable measure and merging it would recreate exactly the
 * conflation that made `contractedValue` read 0.
 *
 * The basis is returned WITH the amount so a consumer can say where the number came from instead of
 * presenting three different measures as one anonymous "value".
 */
export function resolveDealValue(input: DealValueInputs): ResolvedDealValue {
  if (input.awardDocumented) return { amount: input.awardValue, basis: input.awardValue == null ? 'NONE' : 'AWARD' };
  return input.headlineValue == null ? { amount: null, basis: 'NONE' } : { amount: input.headlineValue, basis: 'HEADLINE' };
}

// ── Finding-emitting rules ────────────────────────────────────────────────────────────────────
// Each rule owns ONE conclusion and emits it as a coded Finding with its provenance. The assessment
// layer only aggregates what these return; it can no longer conclude anything itself.

/** The one place this threshold lives. It used to be re-derived in four separate UI expressions. */
export const QUALIFICATION_MIN_CONFIRMED = 2;

/**
 * Whether qualification coverage is too thin to rely on. A closed deal is exempt — its unanswered
 * questions are history, not work.
 */
export const qualificationCoverageLow = (facts: DealFacts): boolean =>
  !facts.outcome.terminal && facts.qualification.confirmed < QUALIFICATION_MIN_CONFIRMED;

/**
 * Run every deal rule and return the findings plus the two facts coverage needs.
 *
 * This is the ONLY place DealFacts is turned into conclusions. Returning the coverage inputs here
 * (rather than letting the aggregator read facts) is what keeps the pipeline one-way.
 */
export function evaluateDealRules(facts: DealFacts, now: Date = new Date()): {
  findings: Finding[];
  coverage: AssessmentCoverageInputs;
} {
  const attention = opportunityAttention(attentionFactsOf(facts), now);
  const findings: Finding[] = [];
  const open = !facts.outcome.terminal;

  if (attention.gaps.length > 0) {
    findings.push({ code: 'ATTENTION_GAPS', severity: 'ATTENTION', source: 'nextActionInvariant', data: { gaps: [...attention.gaps] } });
  }
  const next = facts.engagement.nextOpenActivity;
  if (next) {
    findings.push({
      code: 'NEXT_ACTION_SCHEDULED', severity: 'INFO', source: 'nextOpenActivity',
      data: { subject: next.subject, ...(next.dueDate ? { dueDate: next.dueDate } : {}) },
    });
  }
  if (qualificationCoverageLow(facts)) {
    findings.push({
      code: 'QUALIFICATION_COVERAGE_LOW', severity: 'ATTENTION', source: 'qualificationCoverage',
      data: { confirmed: facts.qualification.confirmed, total: facts.qualification.dimensions.length },
    });
  }
  // A win nobody can evidence is a real gap — and is not the same thing as a governed win.
  if (facts.outcome.state === 'LEGACY_WON') {
    findings.push({ code: 'AWARD_NOT_EVIDENCED', severity: 'ATTENTION', source: 'awardEvidence', data: { state: facts.outcome.state } });
  }
  if (shouldPromptQuoteOnWon(facts)) {
    findings.push({ code: 'WON_NOT_QUOTED', severity: 'INFO', source: 'quoteOnWon' });
  }
  if (open) {
    findings.push({ code: 'OUTCOME_OPEN', severity: 'INFO', source: 'outcomeState' });
  }
  if (facts.strategy.competitors.state === 'KNOWN_PRESENT') {
    findings.push({
      code: 'COMPETITIVE_DEAL', severity: 'INFO', source: 'competitorKnowledge',
      data: { competitors: facts.strategy.competitors.items },
    });
  }

  return { findings, coverage: { terminal: facts.outcome.terminal, attentionActive: attention.active } };
}
