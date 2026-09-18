import { describe, it, expect } from 'vitest';
import { makeSubmittal, submitForReview, returnWithCode, requiresResubmission, submittalProvenance, reviseSubmittal } from './submittal';

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

  it('accepts a fine-grained shared discipline (e.g. plumbing) now that discipline is the shared vocabulary', () => {
    expect(makeSubmittal({ ...base, discipline: 'plumbing' }).discipline).toBe('plumbing');
  });

  it('normalises an unknown discipline to "other" (shared toDiscipline, no throw)', () => {
    expect(makeSubmittal({ ...base, discipline: 'nonsense' as never }).discipline).toBe('other');
  });
});

describe('review cycle', () => {
  it('draft → submitted → returned Code A (closed, no resubmission)', () => {
    let s = submitForReview(makeSubmittal(base), 'u-dc-1');
    expect(s.status).toBe('submitted');
    expect(s.submittedBy).toBe('u-dc-1');
    s = returnWithCode(s, 'A', { returnedBy: 'u-dc-2', comments: 'No comments' });
    expect(s.status).toBe('returned');
    expect(s.reviewCode).toBe('A');
    expect(s.returnedBy).toBe('u-dc-2');
    expect(requiresResubmission(s)).toBe(false);
  });

  it('Code C requires resubmission and bumps the revision', () => {
    const returned = returnWithCode(submitForReview(makeSubmittal(base), 'u-dc-1'), 'C', { returnedBy: 'u-dc-2', comments: 'Revise duct routing' });
    expect(requiresResubmission(returned)).toBe(true);
    const rev = reviseSubmittal(returned);
    expect(rev.revision).toBe(1);
    expect(rev.status).toBe('draft');
    expect(rev.reviewCode).toBeNull();
    expect(rev.id).not.toBe(returned.id);
    // The new revision inherits NEITHER signature. A resubmission is a fresh act by a fresh actor;
    // carrying the old pair forward would have the previous round's people sign this one.
    expect(rev.submittedBy).toBeNull();
    expect(rev.returnedBy).toBeNull();
  });

  it('cannot return before submitting', () => {
    expect(() => returnWithCode(makeSubmittal(base), 'A', { returnedBy: 'u-dc-2' })).toThrow('must be submitted first');
  });

  it('rejects an invalid review code', () => {
    const s = submitForReview(makeSubmittal(base), 'u-dc-1');
    expect(() => returnWithCode(s, 'E' as never, { returnedBy: 'u-dc-2' })).toThrow('reviewCode must be A, B, C, or D');
  });

  it('cannot revise an A/B-coded submittal', () => {
    const approved = returnWithCode(submitForReview(makeSubmittal(base), 'u-dc-1'), 'B', { returnedBy: 'u-dc-2' });
    expect(() => reviseSubmittal(approved)).toThrow('only a C/D-coded submittal can be revised');
  });

  it('reports whether the two acts left names behind', () => {
    // WHY THIS EXISTS: `status: 'returned'` was reachable with `submittedBy` and `returnedBy` both
    // null — a controlled document went out to the consultant and came back with a decision, and the
    // record named nobody at either end. The status was never the missing part.
    expect(submittalProvenance(makeSubmittal(base))).toBeNull();
    const sent = submitForReview(makeSubmittal(base), 'u-dc-1');
    expect(submittalProvenance(sent)).toBe('recorded');
    expect(submittalProvenance({ ...sent, submittedBy: null })).toBe('incomplete');
    const back = returnWithCode(sent, 'A', { returnedBy: 'u-dc-2' });
    expect(submittalProvenance(back)).toBe('recorded');
    expect(submittalProvenance({ ...back, returnedBy: null })).toBe('incomplete');
  });
});
