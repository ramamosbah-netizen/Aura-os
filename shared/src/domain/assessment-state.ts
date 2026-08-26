/**
 * The five states any AURA assessment (a 360 insights rail, a readiness strip) may report.
 *
 * ── The defect this exists to kill ────────────────────────────────────────────────────────────
 * An EMPTY finding list used to be rendered as a positive verdict ("Nothing needs attention —
 * you're on top of this one"). That made four very different situations look identical:
 * assessed and clean · never assessed · does not apply here · could not be checked.
 *
 * ── The invariant ────────────────────────────────────────────────────────────────────────────
 * `HEALTHY` is EARNED, never assumed. It requires that every check the record was supposed to run
 * actually ran and came back clean. An absent alert is not evidence of health — it is only evidence
 * that nothing spoke. Anything less than full coverage degrades to `NOT_ASSESSED`.
 *
 * ── Boundary ─────────────────────────────────────────────────────────────────────────────────
 * This module owns SEMANTICS ONLY: required + assessed + attentionCount + applicability /
 * verifiability -> state. It holds no English. Check identifiers are closed CODES, so the domain
 * contract never depends on display wording; the UI maps a code to a label and composes a sentence.
 */
export type AssessmentState =
  | 'HEALTHY'
  | 'ATTENTION_REQUIRED'
  | 'NOT_ASSESSED'
  | 'NOT_APPLICABLE'
  | 'UNABLE_TO_VERIFY';

/**
 * Every check any 360 can declare. A CLOSED vocabulary on purpose: an open string type let English
 * wording leak into the domain contract, and made two surfaces able to name the same check
 * differently.
 */
export type AssessmentCheckCode =
  // Opportunity 360
  | 'QUALIFICATION'
  | 'NEXT_ACTION'
  | 'DEAL_ATTENTION'
  | 'CUSTOMER_AWARD_EVIDENCE'
  | 'CONTRACT_HANDOVER'
  // Quotation 360
  | 'APPROVAL_WORKFLOW'
  | 'VALIDITY_DATES'
  | 'PRICING_MARGIN'
  // Lead 360
  | 'LEAD_QUALIFICATION'
  | 'CONTACT_CHANNEL'
  | 'FIRST_RESPONSE_SLA';

export interface AssessmentInput {
  /**
   * How many findings actually demand action. Positive/informational notes are NOT attention —
   * counting them would turn good news into an alarm.
   */
  attentionCount: number;
  /** The checks this record was supposed to run. */
  required: readonly AssessmentCheckCode[];
  /** Which of `required` actually ran and returned a verdict. */
  assessed: readonly AssessmentCheckCode[];
  /** Checks that could not complete — a source failed to load or is unknown. */
  unverifiable?: readonly AssessmentCheckCode[];
  /** Whether this rule set applies to the record at all. Default true. */
  applicable?: boolean;
}

export interface AssessmentVerdict {
  state: AssessmentState;
  /** Required checks that did not run — the reason a clean list is not a clean bill of health. */
  missing: AssessmentCheckCode[];
  /** Checks that could not complete. */
  unverifiable: AssessmentCheckCode[];
}

/**
 * Resolve the verdict. Precedence, most decisive first — UNCHANGED by the move to codes:
 *   1. not applicable  — the rules do not govern this record, so nothing else matters
 *   2. attention       — something concrete needs action; say so even if coverage is partial
 *   3. unable to verify — we tried and could not complete a check
 *   4. not assessed    — coverage is incomplete, so silence proves nothing
 *   5. healthy         — full coverage, everything came back clean
 */
export function resolveAssessment(input: AssessmentInput): AssessmentVerdict {
  const assessed = new Set(input.assessed);
  const missing = input.required.filter((r) => !assessed.has(r));
  const unverifiable = [...(input.unverifiable ?? [])];
  const state: AssessmentState =
    input.applicable === false ? 'NOT_APPLICABLE'
    : input.attentionCount > 0 ? 'ATTENTION_REQUIRED'
    : unverifiable.length > 0 ? 'UNABLE_TO_VERIFY'
    : missing.length > 0 ? 'NOT_ASSESSED'
    : 'HEALTHY';
  return { state, missing, unverifiable };
}

/** Whether the state may be presented as reassurance. Only one of the five may. */
export const isReassuring = (s: AssessmentState): boolean => s === 'HEALTHY';
