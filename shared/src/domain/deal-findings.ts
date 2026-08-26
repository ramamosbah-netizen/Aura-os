/**
 * Finding vocabulary — types only.
 *
 * Lives in its own module so the rules layer (which EMITS findings) and the assessment layer (which
 * AGGREGATES them) can share the vocabulary without the aggregator importing DealFacts. That import
 * graph is the enforcement: `assessDeal` cannot read a fact or re-derive a rule, because facts are
 * not reachable from it.
 */

/** Which rule concluded a finding. Provenance, so nothing re-runs a rule to explain itself. */
export type RuleId =
  | 'nextActionInvariant'
  | 'nextOpenActivity'
  | 'qualificationCoverage'
  | 'awardEvidence'
  | 'quoteOnWon'
  | 'outcomeState'
  | 'competitorKnowledge';

/** What was found. A stable code — never a sentence. */
export type FindingCode =
  | 'ATTENTION_GAPS'
  | 'NEXT_ACTION_SCHEDULED'
  | 'QUALIFICATION_COVERAGE_LOW'
  | 'AWARD_NOT_EVIDENCED'
  | 'WON_NOT_QUOTED'
  | 'OUTCOME_OPEN'
  | 'COMPETITIVE_DEAL';

/**
 * How loudly a finding speaks. Only ATTENTION counts toward the five-state verdict: informational
 * notes must never make a record look like it needs work.
 *
 * CHARACTERIZED from the tones the 360 already used (`warn`/`bad` -> ATTENTION, `accent`/`neutral`
 * -> INFO). Centralizing must not quietly re-rank anything.
 */
export type FindingSeverity = 'ATTENTION' | 'INFO';

export interface Finding {
  code: FindingCode;
  severity: FindingSeverity;
  /** The rule that concluded it. */
  source: RuleId;
  /** Structured evidence the UI may interpolate. Never pre-formatted prose. */
  data?: Record<string, string | number | readonly string[]>;
}
