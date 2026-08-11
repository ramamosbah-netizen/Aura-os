import { describe, expect, it } from 'vitest';
import {
  type Drawing,
  makeDrawing,
  canTransitionDrawing,
  DrawingTransitionError,
  nextRevision,
  submitDrawing,
  startReviewDrawing,
  decideDrawing,
  transmitDrawing,
  closeDrawing,
  reviseDrawing,
} from './drawing';
import { makeDrawingReview, outcomeToDecision } from './drawing-review';

const base = (): Drawing =>
  makeDrawing({ tenantId: 't1', projectId: 'p1', code: 'ELV-CCTV-001', title: 'CCTV Layout' });

/** Drive a fresh drawing to `approved` through the legal path. */
function toApproved(): Drawing {
  let d = base();
  d = submitDrawing(d, 'u1');
  d = startReviewDrawing(d, 'rev1');
  d = decideDrawing(d, 'approved', 'rev1');
  return d;
}

describe('drawing state machine', () => {
  it('walks the full legal lifecycle draft→…→closed', () => {
    let d = base();
    expect(d.status).toBe('draft');
    d = submitDrawing(d, 'u1');
    expect(d.status).toBe('submitted');
    expect(d.submittedBy).toBe('u1');
    d = startReviewDrawing(d, 'rev1');
    expect(d.status).toBe('under_review');
    d = decideDrawing(d, 'approved', 'rev1');
    expect(d.status).toBe('approved');
    expect(d.decidedBy).toBe('rev1');
    d = transmitDrawing(d, 'TR-1');
    expect(d.status).toBe('transmitted');
    expect(d.transmittalRef).toBe('TR-1');
    d = closeDrawing(d);
    expect(d.status).toBe('closed');
    expect(d.closedAt).not.toBeNull();
  });

  it('rejects the ungoverned draft→approved jump', () => {
    expect(canTransitionDrawing('draft', 'approved')).toBe(false);
    const d = base();
    // approving straight from draft is not a legal transition
    expect(() => decideDrawing(d, 'approved', 'x')).toThrow(DrawingTransitionError);
  });

  it('rejects approving from submitted (must go through review)', () => {
    const d = submitDrawing(base(), 'u1');
    expect(() => decideDrawing(d, 'approved', 'x')).toThrow(DrawingTransitionError);
  });

  it('rejects closing a drawing that was never transmitted', () => {
    const d = toApproved();
    expect(() => closeDrawing(d)).toThrow(DrawingTransitionError);
  });

  it('rejects transmitting a rejected drawing', () => {
    let d = submitDrawing(base(), 'u1');
    d = startReviewDrawing(d, 'rev1');
    d = decideDrawing(d, 'rejected', 'rev1');
    expect(d.status).toBe('rejected');
    expect(() => transmitDrawing(d, null)).toThrow(DrawingTransitionError);
  });

  it('a closed revision is immutable — no legal transition and cannot be re-submitted', () => {
    let d = transmitDrawing(toApproved(), 'TR-1');
    d = closeDrawing(d);
    expect(() => submitDrawing(d, 'u1')).toThrow(DrawingTransitionError);
    expect(() => transmitDrawing(d, null)).toThrow(DrawingTransitionError);
  });
});

describe('revision handling', () => {
  it('nextRevision increments numeric (zero-padded), alpha, else suffixes', () => {
    expect(nextRevision('0')).toBe('1');
    expect(nextRevision('01')).toBe('02');
    expect(nextRevision('09')).toBe('10');
    expect(nextRevision('A')).toBe('B');
    expect(nextRevision('C')).toBe('D');
    expect(nextRevision('P1')).toBe('P1.1');
  });

  it('revising a rejected drawing creates the next draft revision and supersedes the source', () => {
    let d = submitDrawing(base(), 'u1');
    d = startReviewDrawing(d, 'rev1');
    d = decideDrawing(d, 'rejected', 'rev1');

    const { revised, superseded } = reviseDrawing(d, { reason: 'Fix camera coverage L02', actorId: 'u1' });
    expect(revised.revision).toBe('1');
    expect(revised.status).toBe('draft');
    expect(revised.previousRevision).toBe('0');
    expect(revised.reasonForRevision).toBe('Fix camera coverage L02');
    expect(revised.id).not.toBe(d.id); // a NEW row, not an overwrite
    expect(superseded.status).toBe('superseded');
    expect(superseded.id).toBe(d.id);
  });

  it('cannot revise a draft/submitted/under_review drawing (nothing to supersede yet)', () => {
    expect(() => reviseDrawing(base(), { reason: 'x' })).toThrow(DrawingTransitionError);
    const submitted = submitDrawing(base(), 'u1');
    expect(() => reviseDrawing(submitted, { reason: 'x' })).toThrow(DrawingTransitionError);
  });

  it('revise requires a reason', () => {
    let d = submitDrawing(base(), 'u1');
    d = startReviewDrawing(d, 'rev1');
    d = decideDrawing(d, 'revision_required', 'rev1');
    expect(() => reviseDrawing(d, { reason: '   ' })).toThrow(/reason/i);
  });
});

describe('review records', () => {
  it('maps review outcomes to state-machine decisions', () => {
    expect(outcomeToDecision('approved')).toBe('approved');
    expect(outcomeToDecision('approved_with_comments')).toBe('approved');
    expect(outcomeToDecision('rejected')).toBe('rejected');
    expect(outcomeToDecision('returned_for_revision')).toBe('revision_required');
  });

  it('a rejection/return must carry comments', () => {
    const args = { tenantId: 't1', drawingId: 'd1', drawingCode: 'ELV-CCTV-001', revision: '0', projectId: 'p1' };
    expect(() => makeDrawingReview({ ...args, outcome: 'rejected' })).toThrow(/comment/i);
    expect(() => makeDrawingReview({ ...args, outcome: 'returned_for_revision' })).toThrow(/comment/i);
    // an approval needs no comment
    expect(makeDrawingReview({ ...args, outcome: 'approved' }).outcome).toBe('approved');
  });
});
