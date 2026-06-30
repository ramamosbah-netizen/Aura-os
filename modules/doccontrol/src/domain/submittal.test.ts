import { describe, it, expect } from 'vitest';
import { makeSubmittal, submitForReview, returnWithCode, requiresResubmission, reviseSubmittal } from './submittal';

const base = { tenantId: 't1', projectId: 'p1', reference: 'SUB-CCTV-001', title: 'CCTV head-end shop drawing', discipline: 'elv' as const };

describe('makeSubmittal', () => {
  it('creates a draft at revision 0', () => {
    const s = makeSubmittal(base);
    expect(s.status).toBe('draft');
    expect(s.revision).toBe(0);
    expect(s.reviewCode).toBeNull();
    expect(s.discipline).toBe('elv');
  });

  it('requires reference and title', () => {
    expect(() => makeSubmittal({ ...base, reference: '' })).toThrow('reference is required');
    expect(() => makeSubmittal({ ...base, title: ' ' })).toThrow('title is required');
  });

  it('rejects an unknown discipline', () => {
    expect(() => makeSubmittal({ ...base, discipline: 'plumbing' as never })).toThrow('discipline must be one of');
  });
});

describe('review cycle', () => {
  it('draft → submitted → returned Code A (closed, no resubmission)', () => {
    let s = submitForReview(makeSubmittal(base));
    expect(s.status).toBe('submitted');
    s = returnWithCode(s, 'A', 'No comments');
    expect(s.status).toBe('returned');
    expect(s.reviewCode).toBe('A');
    expect(requiresResubmission(s)).toBe(false);
  });

  it('Code C requires resubmission and bumps the revision', () => {
    const returned = returnWithCode(submitForReview(makeSubmittal(base)), 'C', 'Revise duct routing');
    expect(requiresResubmission(returned)).toBe(true);
    const rev = reviseSubmittal(returned);
    expect(rev.revision).toBe(1);
    expect(rev.status).toBe('draft');
    expect(rev.reviewCode).toBeNull();
    expect(rev.id).not.toBe(returned.id);
  });

  it('cannot return before submitting', () => {
    expect(() => returnWithCode(makeSubmittal(base), 'A')).toThrow('must be submitted first');
  });

  it('rejects an invalid review code', () => {
    const s = submitForReview(makeSubmittal(base));
    expect(() => returnWithCode(s, 'E' as never)).toThrow('reviewCode must be A, B, C, or D');
  });

  it('cannot revise an A/B-coded submittal', () => {
    const approved = returnWithCode(submitForReview(makeSubmittal(base)), 'B');
    expect(() => reviseSubmittal(approved)).toThrow('only a C/D-coded submittal can be revised');
  });
});
