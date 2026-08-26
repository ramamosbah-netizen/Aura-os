import type { AssessmentCheckCode, AssessmentState, AssessmentVerdict } from '@aura/shared';

/**
 * The UI boundary for assessment wording.
 *
 * The domain decides WHICH checks were required and assessed, and what state that implies. It holds
 * no English, so display wording can change without touching a contract, and two surfaces can never
 * name the same check differently. Everything a reader sees is composed here.
 */

/** A check code as a reader sees it. Reads naturally mid-sentence, so it is lower-case. */
export const CHECK_LABEL: Record<AssessmentCheckCode, string> = {
  QUALIFICATION: 'qualification',
  NEXT_ACTION: 'the next action',
  DEAL_ATTENTION: 'deal attention',
  CUSTOMER_AWARD_EVIDENCE: 'customer award evidence (PO/LOA)',
  CONTRACT_HANDOVER: 'contract handover',
  APPROVAL_WORKFLOW: 'the approval workflow',
  VALIDITY_DATES: 'validity dates',
  PRICING_MARGIN: 'pricing margin',
  LEAD_QUALIFICATION: 'the qualification assessment',
  CONTACT_CHANNEL: 'a contact channel',
  FIRST_RESPONSE_SLA: 'first-response SLA',
};

/** Short label for a badge/heading. */
export const ASSESSMENT_LABEL: Record<AssessmentState, string> = {
  HEALTHY: 'All clear',
  ATTENTION_REQUIRED: 'Needs attention',
  NOT_ASSESSED: 'Not assessed',
  NOT_APPLICABLE: 'Not applicable',
  UNABLE_TO_VERIFY: 'Unable to verify',
};

const list = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * The sentence a user reads when there is nothing in the list. The wording is asserted by tests,
 * because "empty" and "fine" reading the same was the original bug.
 */
export function describeAssessment(verdict: AssessmentVerdict, context = 'this record'): string {
  const label = (codes: readonly AssessmentCheckCode[]): string => list(codes.map((c) => CHECK_LABEL[c]));
  switch (verdict.state) {
    case 'HEALTHY':
      return 'Checked — nothing needs attention.';
    case 'ATTENTION_REQUIRED':
      return 'Items need attention.';
    case 'NOT_APPLICABLE':
      return `These checks do not apply to ${context}.`;
    case 'UNABLE_TO_VERIFY':
      return `Unable to verify — ${label(verdict.unverifiable)} could not be checked. This is not a clean result.`;
    case 'NOT_ASSESSED':
      return `Not assessed — ${label(verdict.missing)} ${verdict.missing.length === 1 ? 'has' : 'have'} not been checked on ${context}. This is not the same as being fine.`;
  }
}
