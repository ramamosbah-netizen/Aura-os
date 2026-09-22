import { describe, expect, it } from 'vitest';
import {
  approveDocument,
  attachRevisionContent,
  issueDocument,
  makeDocumentRevision,
  rejectDocument,
  startReviewDocument,
  submitDocument,
} from './document-revision';

/**
 * The register held twenty-two columns of lifecycle provenance and no document.
 *
 * A revision could be submitted, reviewed, approved and ISSUED to a client with nothing behind
 * the number, and the O&M pack, the as-built dossier and the transmittal all resolve that number.
 *
 * These tests are about WHEN content may be set, because that is the part a later change would
 * quietly get wrong. A reviewer approves the document they were shown.
 */

const draft = () => makeDocumentRevision({
  tenantId: 't1', registerEntryId: 'reg-1', documentNumber: 'ELV-DWG-001',
  projectId: 'p1', revision: 'A', createdBy: 'u-engineer',
});

describe('the content of a controlled revision', () => {
  it('starts with none — a new revision has nothing behind it yet', () => {
    expect(draft().dmsDocumentId).toBeNull();
  });

  it('is attached while the revision is still the author\'s', () => {
    const r = attachRevisionContent(draft(), 'doc-abc');
    expect(r.dmsDocumentId).toBe('doc-abc');
    expect(r.status).toBe('draft');
  });

  it('may be replaced while it is still a draft', () => {
    // An author who attached the wrong drawing has not yet asked anyone to look at it.
    const once = attachRevisionContent(draft(), 'doc-wrong');
    expect(attachRevisionContent(once, 'doc-right').dmsDocumentId).toBe('doc-right');
  });

  it('CANNOT be swapped once the revision has been submitted', () => {
    // The whole point. From here the revision is somebody else's to judge.
    const submitted = submitDocument(attachRevisionContent(draft(), 'doc-abc'), 'u-engineer');
    expect(() => attachRevisionContent(submitted, 'doc-other')).toThrow(/cannot be replaced/i);
    expect(() => attachRevisionContent(submitted, 'doc-other')).toThrow(/new revision/i);
  });

  it('cannot be swapped under a review, an approval, or an issued document', () => {
    let r = submitDocument(attachRevisionContent(draft(), 'doc-abc'), 'u-engineer');
    r = startReviewDocument(r, 'u-tm');
    expect(() => attachRevisionContent(r, 'x'), 'under review').toThrow(/under_review/);
    const approved = approveDocument(r, 'u-tm2', 'fine');
    expect(() => attachRevisionContent(approved, 'x'), 'approved').toThrow(/approved/);
    const issued = issueDocument(approved, 'u-dc');
    // The register already promises an issued revision is immutable; this is that promise
    // extended to the one thing it did not previously cover, because it did not exist.
    expect(() => attachRevisionContent(issued, 'x'), 'issued').toThrow(/issued/);
  });

  it('cannot be swapped on a rejected revision either', () => {
    let r = submitDocument(attachRevisionContent(draft(), 'doc-abc'), 'u-engineer');
    r = startReviewDocument(r, 'u-tm');
    const rejected = rejectDocument(r, 'u-tm2', 'wrong cable schedule');
    // Correcting a rejection is a NEW revision, which is what the lifecycle already says.
    expect(() => attachRevisionContent(rejected, 'x')).toThrow(/rejected/);
  });

  it('refuses an empty reference rather than storing one', () => {
    expect(() => attachRevisionContent(draft(), '   ')).toThrow(/document id is required/i);
  });

  it('survives the lifecycle it was attached before', () => {
    // The content set on the draft is still the content of the issued revision — the register
    // now answers "what was issued" with something, which is the whole change.
    let r = attachRevisionContent(draft(), 'doc-abc');
    r = submitDocument(r, 'u-engineer');
    r = startReviewDocument(r, 'u-tm');
    r = approveDocument(r, 'u-tm2', 'ok');
    r = issueDocument(r, 'u-dc');
    expect(r.status).toBe('issued');
    expect(r.dmsDocumentId).toBe('doc-abc');
  });
});
