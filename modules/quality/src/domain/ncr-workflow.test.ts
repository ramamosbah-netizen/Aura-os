import { describe, expect, it } from 'vitest';
import {
  type Ncr,
  makeNcr,
  canTransitionNcr,
  NcrTransitionError,
  planNcrAction,
  markNcrCorrected,
  verifyNcr,
} from './ncr';
import { makeNcrVerification } from './ncr-verification';
import { assertInspectionTransition, InspectionTransitionError } from './inspection-request';

const base = (): Ncr =>
  makeNcr({ tenantId: 't1', projectId: 'p1', ncrNumber: 'NCR-001', description: 'Camera coverage gap', severity: 'major' });

const planned = (): Ncr => planNcrAction(base(), { rootCause: 'Wrong template', correctiveAction: 'Reposition cameras', assignedTo: 'u2' });

describe('NCR corrective-action state machine', () => {
  it('walks raised → action_planned → corrected → closed', () => {
    let n = base();
    expect(n.status).toBe('raised');
    n = planNcrAction(n, { rootCause: 'Wrong template', correctiveAction: 'Reposition cameras' });
    expect(n.status).toBe('action_planned');
    expect(n.rootCause).toBe('Wrong template');
    expect(n.correctiveAction).toBe('Reposition cameras');
    n = markNcrCorrected(n, 'u2');
    expect(n.status).toBe('corrected');
    expect(n.correctedBy).toBe('u2');
    n = verifyNcr(n, true, 'qa1');
    expect(n.status).toBe('closed');
    expect(n.verifiedBy).toBe('qa1');
    expect(n.closedAt).not.toBeNull();
  });

  it('a rejected verification loops corrected → action_planned (re-correct)', () => {
    const n = verifyNcr(markNcrCorrected(planned(), 'u2'), false, 'qa1');
    expect(n.status).toBe('action_planned');
    expect(n.closedAt).toBeNull();
  });

  it('rejects illegal jumps', () => {
    expect(canTransitionNcr('raised', 'corrected')).toBe(false);
    expect(canTransitionNcr('raised', 'closed')).toBe(false);
    // cannot correct a freshly-raised NCR (must plan first)
    expect(() => markNcrCorrected(base(), 'u2')).toThrow(NcrTransitionError);
    // cannot verify an NCR that is not yet corrected
    expect(() => verifyNcr(planned(), true, 'qa1')).toThrow(NcrTransitionError);
  });

  it('a closed NCR is immutable', () => {
    const closed = verifyNcr(markNcrCorrected(planned(), 'u2'), true, 'qa1');
    expect(() => markNcrCorrected(closed, 'u2')).toThrow(NcrTransitionError);
    expect(() => verifyNcr(closed, false, 'qa1')).toThrow(NcrTransitionError);
  });

  it('plan requires both root cause and corrective action', () => {
    expect(() => planNcrAction(base(), { rootCause: '', correctiveAction: 'x' })).toThrow(/root cause/i);
    expect(() => planNcrAction(base(), { rootCause: 'x', correctiveAction: '  ' })).toThrow(/corrective action/i);
  });
});

describe('NCR verification record', () => {
  const args = { tenantId: 't1', ncrId: 'n1', ncrNumber: 'NCR-001', projectId: 'p1' };
  it('a rejected verification requires a note', () => {
    expect(() => makeNcrVerification({ ...args, outcome: 'rejected' })).toThrow(/note/i);
    expect(makeNcrVerification({ ...args, outcome: 'accepted' }).outcome).toBe('accepted');
    expect(makeNcrVerification({ ...args, outcome: 'rejected', note: 'still 5mm out' }).note).toBe('still 5mm out');
  });
});

describe('Inspection Request transitions', () => {
  it('a resolved inspection cannot be re-resolved', () => {
    expect(() => assertInspectionTransition('approved', 'rejected')).toThrow(InspectionTransitionError);
    expect(() => assertInspectionTransition('rejected', 'approved')).toThrow(InspectionTransitionError);
    // legal
    expect(() => assertInspectionTransition('requested', 'in_progress')).not.toThrow();
    expect(() => assertInspectionTransition('in_progress', 'approved')).not.toThrow();
    expect(() => assertInspectionTransition('requested', 'rejected')).not.toThrow();
  });
});
