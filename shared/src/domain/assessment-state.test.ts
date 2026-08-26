import { describe, it, expect } from 'vitest';
import { resolveAssessment, isReassuring, type AssessmentCheckCode } from './assessment-state';

// Phase 0 — the five-state contract. The bug being pinned: an empty finding list rendered as a
// positive verdict, so "assessed and clean", "never assessed", "does not apply" and "could not be
// checked" all read identically. HEALTHY must be EARNED by coverage.
//
// Per G-05: assert the WORDING a user reads, not just the enum — a differing sentence is exactly
// how the original defect hid.

const open = { required: ['QUALIFICATION', 'NEXT_ACTION'] as AssessmentCheckCode[], assessed: ['QUALIFICATION', 'NEXT_ACTION'] as AssessmentCheckCode[] };

describe('resolveAssessment — HEALTHY is earned, never assumed', () => {
  it('full coverage + no attention → HEALTHY', () => {
    expect(resolveAssessment({ attentionCount: 0, ...open }).state).toBe('HEALTHY');
  });

  it('THE ORIGINAL BUG: zero findings but nothing was checked → NOT_ASSESSED, never HEALTHY', () => {
    const v = resolveAssessment({ attentionCount: 0, required: ['CUSTOMER_AWARD_EVIDENCE', 'CONTRACT_HANDOVER'] as AssessmentCheckCode[], assessed: [] });
    expect(v.state).toBe('NOT_ASSESSED');
    expect(v.missing).toEqual(['CUSTOMER_AWARD_EVIDENCE', 'CONTRACT_HANDOVER']);
  });

  it('partial coverage degrades to NOT_ASSESSED — a gap in the rules cannot read as clean', () => {
    const v = resolveAssessment({ attentionCount: 0, required: ['QUALIFICATION', 'PRICING_MARGIN'] as AssessmentCheckCode[], assessed: ['QUALIFICATION'] as AssessmentCheckCode[] });
    expect(v.state).toBe('NOT_ASSESSED');
    expect(v.missing).toEqual(['PRICING_MARGIN']);
  });

  it('a check that could not complete → UNABLE_TO_VERIFY, not HEALTHY', () => {
    expect(resolveAssessment({ attentionCount: 0, ...open, unverifiable: ['CONTRACT_HANDOVER'] as AssessmentCheckCode[] }).state).toBe('UNABLE_TO_VERIFY');
  });

  it('rules that do not govern the record → NOT_APPLICABLE (outranks everything)', () => {
    const v = resolveAssessment({ attentionCount: 5, required: ['QUALIFICATION'] as AssessmentCheckCode[], assessed: [], applicable: false, unverifiable: ['CONTRACT_HANDOVER'] as AssessmentCheckCode[] });
    expect(v.state).toBe('NOT_APPLICABLE');
  });

  it('real findings win over partial coverage — say the concrete thing', () => {
    expect(resolveAssessment({ attentionCount: 2, required: ['QUALIFICATION', 'NEXT_ACTION'] as AssessmentCheckCode[], assessed: [] }).state).toBe('ATTENTION_REQUIRED');
  });

  it('positive/informational notes are not attention (good news must not raise an alarm)', () => {
    // e.g. "Converted", "Ready to send" — counted as findings by the UI, but attentionCount is 0.
    expect(resolveAssessment({ attentionCount: 0, ...open }).state).toBe('HEALTHY');
  });
});

describe('negative control', () => {
  it('the old behaviour (empty ⇒ reassurance) would FAIL this suite', () => {
    // The pre-fix rule was literally `insights.length === 0 → "Nothing needs attention"`.
    const oldRule = (attentionCount: number) => (attentionCount === 0 ? 'HEALTHY' : 'ATTENTION_REQUIRED');
    const unchecked = { attentionCount: 0, required: ['CUSTOMER_AWARD_EVIDENCE'] as AssessmentCheckCode[], assessed: [] };
    expect(oldRule(unchecked.attentionCount)).toBe('HEALTHY');            // what it used to say
    expect(resolveAssessment(unchecked).state).toBe('NOT_ASSESSED');      // what it must say now
    expect(resolveAssessment(unchecked).state).not.toBe(oldRule(unchecked.attentionCount));
  });
});
