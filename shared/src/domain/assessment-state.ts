/**
 * The five states any AURA assessment (a 360 insights rail, a health verdict, a readiness strip)
 * may report. One vocabulary, so every surface answers the same question the same way.
 *
 * ── The defect this exists to kill ────────────────────────────────────────────────────────────
 * An EMPTY finding list used to be rendered as a positive verdict ("Nothing needs attention —
 * you're on top of this one"). That made four very different situations look identical:
 *   assessed and clean · never assessed · does not apply here · could not be checked.
 * Measured live on a governed Won deal: the pursuit rules short-circuit for a closed deal, the
 * client emitted no findings, and the panel congratulated the user on a deal with qualification
 * 1/4, no customer PO/LOA and no contract. Same defect class as G-05 error semantics, where an
 * empty result read identically to a failed one.
 *
 * ── The invariant ────────────────────────────────────────────────────────────────────────────
 * `HEALTHY` is EARNED, never assumed. It requires that every check the record was supposed to
 * run actually ran and came back clean. An absent alert is not evidence of health — it is only
 * evidence that nothing spoke. Anything less than full coverage degrades to `NOT_ASSESSED`, so a
 * gap in the rules can never masquerade as a clean bill of health under a friendlier name.
 */
export type AssessmentState =
  | 'HEALTHY'
  | 'ATTENTION_REQUIRED'
  | 'NOT_ASSESSED'
  | 'NOT_APPLICABLE'
  | 'UNABLE_TO_VERIFY';

export interface AssessmentInput {
  /**
   * How many findings actually demand action. Positive/informational notes ("Converted",
   * "Ready to send") are NOT attention — counting them would turn good news into an alarm.
   */
  attentionCount: number;
  /** The checks this record is supposed to run, named for the reader (they appear in the copy). */
  required: readonly string[];
  /** Which of `required` actually ran and returned a verdict. */
  assessed: readonly string[];
  /** Checks that could not complete — a source failed to load or is unknown. */
  unverifiable?: readonly string[];
  /** Whether this rule set applies to the record at all. Default true. */
  applicable?: boolean;
}

export interface AssessmentVerdict {
  state: AssessmentState;
  /** Required checks that did not run — the reason a clean list is not a clean bill of health. */
  missing: string[];
  /** Checks that could not complete. */
  unverifiable: string[];
}

/**
 * Resolve the verdict. Precedence, most decisive first:
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

const list = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * The sentence a user reads when there is nothing in the list. Wording is part of the contract —
 * tests assert these strings, because "empty" and "fine" reading the same was the original bug.
 */
export function describeAssessment(verdict: AssessmentVerdict, context = 'this record'): string {
  switch (verdict.state) {
    case 'HEALTHY':
      return 'Checked — nothing needs attention.';
    case 'ATTENTION_REQUIRED':
      return 'Items need attention.';
    case 'NOT_APPLICABLE':
      return `These checks do not apply to ${context}.`;
    case 'UNABLE_TO_VERIFY':
      return `Unable to verify — ${list(verdict.unverifiable)} could not be checked. This is not a clean result.`;
    case 'NOT_ASSESSED':
      return `Not assessed — ${list(verdict.missing)} ${verdict.missing.length === 1 ? 'has' : 'have'} not been checked on ${context}. This is not the same as being fine.`;
  }
}

/** Short label for a badge/heading. */
export const ASSESSMENT_LABEL: Record<AssessmentState, string> = {
  HEALTHY: 'All clear',
  ATTENTION_REQUIRED: 'Needs attention',
  NOT_ASSESSED: 'Not assessed',
  NOT_APPLICABLE: 'Not applicable',
  UNABLE_TO_VERIFY: 'Unable to verify',
};

/** Whether the state may be presented as reassurance. Only one of the five may. */
export const isReassuring = (s: AssessmentState): boolean => s === 'HEALTHY';
