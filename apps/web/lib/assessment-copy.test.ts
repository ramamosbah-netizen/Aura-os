import { describe, it, expect } from 'vitest';
import { resolveAssessment, type AssessmentCheckCode } from '@aura/shared';
import { describeAssessment, CHECK_LABEL, ASSESSMENT_LABEL } from './assessment-copy';

// Wording lives at the UI boundary now — the domain holds codes only. These moved here from
// shared/assessment-state.test.ts unchanged in substance: per G-05, assert the SENTENCE a user
// reads, because "empty" and "fine" reading the same was the original defect.

const open = { required: ['QUALIFICATION', 'NEXT_ACTION'] as AssessmentCheckCode[], assessed: ['QUALIFICATION', 'NEXT_ACTION'] as AssessmentCheckCode[] };

describe('describeAssessment — the wording is the contract', () => {
  it('NOT_ASSESSED names the missing checks and denies the "fine" reading', () => {
    const v = resolveAssessment({ attentionCount: 0, required: ['CUSTOMER_AWARD_EVIDENCE', 'CONTRACT_HANDOVER'], assessed: [] });
    const s = describeAssessment(v, 'this deal');
    expect(s).toBe('Not assessed — customer award evidence (PO/LOA) and contract handover have not been checked on this deal. This is not the same as being fine.');
    expect(s).not.toMatch(/nothing needs attention/i);
  });

  it('a single missing check reads grammatically', () => {
    const v = resolveAssessment({ attentionCount: 0, required: ['PRICING_MARGIN'], assessed: [] });
    expect(describeAssessment(v, 'this quotation')).toBe('Not assessed — pricing margin has not been checked on this quotation. This is not the same as being fine.');
  });

  it('UNABLE_TO_VERIFY refuses to read as clean', () => {
    const v = resolveAssessment({ attentionCount: 0, ...open, unverifiable: ['CONTRACT_HANDOVER'] });
    expect(describeAssessment(v)).toBe('Unable to verify — contract handover could not be checked. This is not a clean result.');
  });

  it('NOT_APPLICABLE names the context rather than congratulating', () => {
    const v = resolveAssessment({ attentionCount: 0, required: [], assessed: [], applicable: false });
    expect(describeAssessment(v, 'a converted lead')).toBe('These checks do not apply to a converted lead.');
  });

  it('only HEALTHY reassures', () => {
    expect(describeAssessment(resolveAssessment({ attentionCount: 0, ...open }))).toBe('Checked — nothing needs attention.');
  });

  it('every state produces a distinct sentence and label', () => {
    const states = ['HEALTHY', 'ATTENTION_REQUIRED', 'NOT_ASSESSED', 'NOT_APPLICABLE', 'UNABLE_TO_VERIFY'] as const;
    const sentences = states.map((state) => describeAssessment({ state, missing: ['QUALIFICATION'], unverifiable: ['NEXT_ACTION'] }));
    expect(new Set(sentences).size).toBe(states.length);
    expect(new Set(states.map((s) => ASSESSMENT_LABEL[s])).size).toBe(states.length);
  });

  it('every check code has a label — no code can render as a raw identifier', () => {
    const codes: AssessmentCheckCode[] = ['QUALIFICATION', 'NEXT_ACTION', 'DEAL_ATTENTION', 'CUSTOMER_AWARD_EVIDENCE', 'CONTRACT_HANDOVER', 'APPROVAL_WORKFLOW', 'VALIDITY_DATES', 'PRICING_MARGIN', 'LEAD_QUALIFICATION', 'CONTACT_CHANNEL', 'FIRST_RESPONSE_SLA'];
    for (const c of codes) expect(CHECK_LABEL[c]).toBeTruthy();
    expect(new Set(Object.values(CHECK_LABEL)).size).toBe(codes.length);
  });
});
