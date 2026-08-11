import { describe, expect, it } from 'vitest';
import {
  type DocumentRevision,
  makeDocumentRevision,
  canTransitionDocument,
  DocumentTransitionError,
  nextRevision,
  submitDocument,
  startReviewDocument,
  approveDocument,
  rejectDocument,
  issueDocument,
  supersedeDocument,
  createNextRevision,
} from './document-revision';
import {
  makeTransmittal,
  sendTransmittal,
  receiveTransmittal,
  acknowledgeTransmittal,
  TransmittalTransitionError,
} from './transmittal';

const base = (): DocumentRevision =>
  makeDocumentRevision({ tenantId: 't1', registerEntryId: 'r1', documentNumber: 'ELV-SPEC-001', projectId: 'p1', revision: 'A' });

/** Drive a fresh revision to approved through the legal path. */
function toApproved(): DocumentRevision {
  return approveDocument(startReviewDocument(submitDocument(base(), 'u1'), 'rev1'), 'rev1');
}

describe('document revision state machine', () => {
  it('walks draft → submitted → under_review → approved → issued → superseded', () => {
    let d = base();
    expect(d.status).toBe('draft');
    d = submitDocument(d, 'u1');
    expect(d.status).toBe('submitted');
    d = startReviewDocument(d, 'rev1');
    expect(d.status).toBe('under_review');
    d = approveDocument(d, 'rev1', 'looks good');
    expect(d.status).toBe('approved');
    expect(d.decisionComments).toBe('looks good');
    d = issueDocument(d, 'rev1');
    expect(d.status).toBe('issued');
    expect(d.issuedAt).not.toBeNull();
    d = supersedeDocument(d);
    expect(d.status).toBe('superseded');
  });

  it('rejects illegal transitions', () => {
    expect(canTransitionDocument('draft', 'approved')).toBe(false);
    expect(canTransitionDocument('draft', 'issued')).toBe(false);
    // cannot approve straight from draft / submitted
    expect(() => approveDocument(base(), 'x')).toThrow(DocumentTransitionError);
    expect(() => approveDocument(submitDocument(base(), 'u1'), 'x')).toThrow(DocumentTransitionError);
    // cannot issue before approval
    expect(() => issueDocument(startReviewDocument(submitDocument(base(), 'u1'), 'r'), 'x')).toThrow(DocumentTransitionError);
  });

  it('a rejection requires a reason and lands in rejected', () => {
    const underReview = startReviewDocument(submitDocument(base(), 'u1'), 'rev1');
    expect(() => rejectDocument(underReview, 'rev1', '   ')).toThrow(/reason/i);
    const rejected = rejectDocument(underReview, 'rev1', 'Missing load calcs');
    expect(rejected.status).toBe('rejected');
    expect(rejected.decisionComments).toBe('Missing load calcs');
  });

  it('an issued revision is immutable — only a new revision moves forward', () => {
    const issued = issueDocument(toApproved(), 'rev1');
    expect(() => submitDocument(issued, 'u1')).toThrow(DocumentTransitionError);
    expect(() => approveDocument(issued, 'x')).toThrow(DocumentTransitionError);

    const next = createNextRevision(issued, { reason: 'Client change', actorId: 'u1' });
    expect(next.revision).toBe('B'); // A → B
    expect(next.status).toBe('draft');
    expect(next.previousRevision).toBe('A');
    expect(next.id).not.toBe(issued.id); // the source stays untouched
  });

  it('a rejected revision can spawn the next revision (reject → new draft loop)', () => {
    const rejected = rejectDocument(startReviewDocument(submitDocument(base(), 'u1'), 'rev1'), 'rev1', 'fix it');
    const next = createNextRevision(rejected, { reason: 'Addressed comments' });
    expect(next.status).toBe('draft');
    expect(next.previousRevision).toBe('A');
  });

  it('cannot spawn a revision mid-review, and requires a reason', () => {
    expect(() => createNextRevision(base(), { reason: 'x' })).toThrow(DocumentTransitionError); // draft
    expect(() => createNextRevision(toApproved(), { reason: 'x' })).toThrow(DocumentTransitionError); // approved (not issued)
    const issued = issueDocument(toApproved(), 'rev1');
    expect(() => createNextRevision(issued, { reason: '  ' })).toThrow(/reason/i);
  });

  it('nextRevision increments alpha and numeric', () => {
    expect(nextRevision('A')).toBe('B');
    expect(nextRevision('C')).toBe('D');
    expect(nextRevision('00')).toBe('01');
    expect(nextRevision('09')).toBe('10');
  });
});

describe('transmittal conveyance state machine', () => {
  const t = () => makeTransmittal({ tenantId: 't1', projectId: 'p1', code: 'TR-1', title: 'Pkg' });

  it('walks draft → sent → received → acknowledged', () => {
    let x = t();
    expect(x.status).toBe('draft');
    x = sendTransmittal(x);
    expect(x.status).toBe('sent');
    expect(x.sentAt).not.toBeNull();
    x = receiveTransmittal(x);
    expect(x.status).toBe('received');
    x = acknowledgeTransmittal(x);
    expect(x.status).toBe('acknowledged');
  });

  it('rejects illegal transmittal transitions', () => {
    // cannot acknowledge a draft (must be sent/received first)
    expect(() => acknowledgeTransmittal(t())).toThrow(TransmittalTransitionError);
    // cannot receive a draft
    expect(() => receiveTransmittal(t())).toThrow(TransmittalTransitionError);
    // cannot re-send after acknowledgement
    const ack = acknowledgeTransmittal(sendTransmittal(t()));
    expect(() => sendTransmittal(ack)).toThrow(TransmittalTransitionError);
  });
});
