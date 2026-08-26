import type { AssessmentCheckCode, AssessmentInput } from './assessment-state';
import type { Finding } from './deal-findings';

/**
 * The assessment layer — AGGREGATION ONLY.
 *
 *   DealFacts -> rules -> FINDINGS ──► THIS ──► UI
 *
 * It counts what the rules found and declares what the record was supposed to be checked for. It
 * concludes nothing itself, holds no threshold, and owns no wording.
 *
 * NOTE THE IMPORTS: `DealFacts` is deliberately NOT among them. An earlier draft took the full fact
 * tree "just to decide coverage" and promptly grew six findings of its own — a second rules engine.
 * Removing facts from the import graph is what prevents that recurring; a comment would not.
 */

/** The only facts coverage needs. Deliberately two booleans, not a tree. */
export interface AssessmentCoverageInputs {
  /** The pursuit is over (won either way, or lost). */
  terminal: boolean;
  /** Whether the Next-Action Invariant considers this record in scope. */
  attentionActive: boolean;
}

export interface DealAssessment {
  findings: Finding[];
  coverage: AssessmentInput;
  /** Convenience for surfaces that only need the headline. */
  needsAttention: boolean;
}

export function assessDeal(findings: readonly Finding[], coverage: AssessmentCoverageInputs): DealAssessment {
  // What this rule set can actually speak to.
  //
  // An OPEN deal is covered by the pursuit checks. A CLOSED one is NOT: the post-award questions
  // have no rules yet, and `awardEvidence.customerPoOrLoa` is NOT_CAPTURED, so AURA has nowhere to
  // look. Declaring them required-but-unassessed is the honest answer; claiming the deal is fine
  // would be the original bug.
  const required: AssessmentCheckCode[] = coverage.terminal
    ? ['CUSTOMER_AWARD_EVIDENCE', 'CONTRACT_HANDOVER']
    : ['QUALIFICATION', 'NEXT_ACTION', 'DEAL_ATTENTION'];
  const assessed: AssessmentCheckCode[] = coverage.terminal
    ? []
    : ['QUALIFICATION', 'NEXT_ACTION', ...(coverage.attentionActive ? (['DEAL_ATTENTION'] as const) : [])];

  const attentionCount = findings.filter((f) => f.severity === 'ATTENTION').length;
  return {
    findings: [...findings],
    coverage: { attentionCount, required, assessed, applicable: true },
    needsAttention: attentionCount > 0,
  };
}
