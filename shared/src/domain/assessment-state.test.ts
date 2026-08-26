import { describe, it, expect } from 'vitest';
import { resolveAssessment, describeAssessment, ASSESSMENT_LABEL, isReassuring } from './assessment-state';

// Phase 0 — the five-state contract. The bug being pinned: an empty finding list rendered as a
// positive verdict, so "assessed and clean", "never assessed", "does not apply" and "could not be
// checked" all read identically. HEALTHY must be EARNED by coverage.
//
// Per G-05: assert the WORDING a user reads, not just the enum — a differing sentence is exactly
// how the original defect hid.

const open = { required: ['qualification', 'next action'], assessed: ['qualification', 'next action'] };

describe('resolveAssessment — HEALTHY is earned, never assumed', () => {
  it('full coverage + no attention → HEALTHY', () => {
    expect(resolveAssessment({ attentionCount: 0, ...open }).state).toBe('HEALTHY');
  });

  it('THE ORIGINAL BUG: zero findings but nothing was checked → NOT_ASSESSED, never HEALTHY', () => {
    const v = resolveAssessment({ attentionCount: 0, required: ['award evidence', 'contract'], assessed: [] });
    expect(v.state).toBe('NOT_ASSESSED');
    expect(v.missing).toEqual(['award evidence', 'contract']);
  });

  it('partial coverage degrades to NOT_ASSESSED — a gap in the rules cannot read as clean', () => {
    const v = resolveAssessment({ attentionCount: 0, required: ['qualification', 'pricing'], assessed: ['qualification'] });
    expect(v.state).toBe('NOT_ASSESSED');
    expect(v.missing).toEqual(['pricing']);
  });

  it('a check that could not complete → UNABLE_TO_VERIFY, not HEALTHY', () => {
    expect(resolveAssessment({ attentionCount: 0, ...open, unverifiable: ['documents'] }).state).toBe('UNABLE_TO_VERIFY');
  });

  it('rules that do not govern the record → NOT_APPLICABLE (outranks everything)', () => {
    const v = resolveAssessment({ attentionCount: 5, required: ['qualification'], assessed: [], applicable: false, unverifiable: ['x'] });
    expect(v.state).toBe('NOT_APPLICABLE');
  });

  it('real findings win over partial coverage — say the concrete thing', () => {
    expect(resolveAssessment({ attentionCount: 2, required: ['a', 'b'], assessed: [] }).state).toBe('ATTENTION_REQUIRED');
  });

  it('positive/informational notes are not attention (good news must not raise an alarm)', () => {
    // e.g. "Converted", "Ready to send" — counted as findings by the UI, but attentionCount is 0.
    expect(resolveAssessment({ attentionCount: 0, ...open }).state).toBe('HEALTHY');
  });
});

describe('describeAssessment — the wording is the contract', () => {
  it('NOT_ASSESSED says so explicitly and denies the "fine" reading', () => {
    const v = resolveAssessment({ attentionCount: 0, required: ['award evidence', 'contract'], assessed: [] });
    const s = describeAssessment(v, 'this deal');
    expect(s).toBe('Not assessed — award evidence and contract have not been checked on this deal. This is not the same as being fine.');
    expect(s).not.toMatch(/nothing needs attention/i);
  });

  it('a single missing check reads grammatically', () => {
    const v = resolveAssessment({ attentionCount: 0, required: ['pricing'], assessed: [] });
    expect(describeAssessment(v, 'this quote')).toBe('Not assessed — pricing has not been checked on this quote. This is not the same as being fine.');
  });

  it('UNABLE_TO_VERIFY refuses to read as clean', () => {
    const v = resolveAssessment({ attentionCount: 0, ...open, unverifiable: ['documents'] });
    expect(describeAssessment(v)).toBe('Unable to verify — documents could not be checked. This is not a clean result.');
  });

  it('NOT_APPLICABLE names the context rather than congratulating', () => {
    const v = resolveAssessment({ attentionCount: 0, required: [], assessed: [], applicable: false });
    expect(describeAssessment(v, 'a converted lead')).toBe('These checks do not apply to a converted lead.');
  });

  it('only HEALTHY is allowed to reassure', () => {
    expect(describeAssessment(resolveAssessment({ attentionCount: 0, ...open }))).toBe('Checked — nothing needs attention.');
    expect(isReassuring('HEALTHY')).toBe(true);
    for (const s of ['ATTENTION_REQUIRED', 'NOT_ASSESSED', 'NOT_APPLICABLE', 'UNABLE_TO_VERIFY'] as const) {
      expect(isReassuring(s)).toBe(false);
    }
  });

  it('every state has a distinct label and sentence (no two situations read the same)', () => {
    const states = ['HEALTHY', 'ATTENTION_REQUIRED', 'NOT_ASSESSED', 'NOT_APPLICABLE', 'UNABLE_TO_VERIFY'] as const;
    const labels = states.map((s) => ASSESSMENT_LABEL[s]);
    expect(new Set(labels).size).toBe(states.length);
    const sentences = states.map((s) => describeAssessment({ state: s, missing: ['m'], unverifiable: ['u'] }));
    expect(new Set(sentences).size).toBe(states.length);
  });
});

describe('negative control', () => {
  it('the old behaviour (empty ⇒ reassurance) would FAIL this suite', () => {
    // The pre-fix rule was literally `insights.length === 0 → "Nothing needs attention"`.
    const oldRule = (attentionCount: number) => (attentionCount === 0 ? 'HEALTHY' : 'ATTENTION_REQUIRED');
    const unchecked = { attentionCount: 0, required: ['award evidence'], assessed: [] };
    expect(oldRule(unchecked.attentionCount)).toBe('HEALTHY');            // what it used to say
    expect(resolveAssessment(unchecked).state).toBe('NOT_ASSESSED');      // what it must say now
    expect(resolveAssessment(unchecked).state).not.toBe(oldRule(unchecked.attentionCount));
  });
});
