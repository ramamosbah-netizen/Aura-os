import { describe, expect, it } from 'vitest';
import {
  type SignatoryAuthority,
  type SignedCommissioningResult,
  commissioningResultHash,
  evidenceForParty,
  makeSignoffEvidence,
} from './signoff-evidence';
import {
  type AttachmentCategory,
  makeCommissioningAttachment,
} from './commissioning-attachment';

/**
 * TC-06 / TC-07 — WHOSE WITNESS, AND WHAT THE TEST PRODUCED.
 *
 * TC-06 asks that "witness identity AND AUTHORITY persist". The sign-off recorded a name and which
 * side of the sign-off it belonged to, which answers WHO and leaves WHOSE unanswered — and on a
 * UAE ELV project a consultant's witness, the client's own representative and an authority
 * inspector are three different standings that a certificate cannot afford to blur.
 *
 * TC-07 is "Witness signature AND ATTACHMENTS". The signature existed; the attachments did not,
 * because commissioning had no door for a file at all.
 */

const RESULT: SignedCommissioningResult = {
  code: 'TC-CCTV-01', system: 'cctv', testDate: '2026-09-23', pointsPassed: 12, pointsTotal: 12,
};

const base = {
  tenantId: 't1', commissioningId: 'rec-1', projectId: 'p1',
  documentId: 'doc-1', documentHash: 'sha256:abc',
  signedContentHash: commissioningResultHash(RESULT),
};

describe('a witness says whose witness they are', () => {
  it('records the authority the signatory acted under', () => {
    const e = makeSignoffEvidence({ ...base, party: 'witness', method: 'electronic', signedBy: 'R. Consultant', authority: 'consultant' });
    expect(e.authority).toBe('consultant');
  });

  it('refuses a witness signature that does not say', () => {
    // The gap TC-06 names. "Witnessed by R. Consultant" does not tell a reader a year later
    // whether a consultant, the client or an authority inspector signed.
    expect(() => makeSignoffEvidence({ ...base, party: 'witness', method: 'electronic', signedBy: 'R. Consultant' }))
      .toThrow(/whose witness it is/i);
  });

  it('defaults the commissioning engineer to the contractor rather than asking', () => {
    // The engineer signs for the contractor by definition; asking would be a question with one
    // answer, and a form full of those is how people stop reading them.
    const e = makeSignoffEvidence({ ...base, party: 'commissioning_engineer', method: 'electronic', signedBy: 'A. Engineer' });
    expect(e.authority).toBe('contractor');
  });

  it('still lets the engineer be recorded under another standing when they really are', () => {
    const e = makeSignoffEvidence({ ...base, party: 'commissioning_engineer', method: 'electronic', signedBy: 'A. Engineer', authority: 'client' });
    expect(e.authority).toBe('client');
  });

  it('refuses an authority outside the four', () => {
    expect(() => makeSignoffEvidence({
      ...base, party: 'witness', method: 'electronic', signedBy: 'X',
      authority: 'landlord' as SignatoryAuthority,
    })).toThrow(/must be one of contractor, consultant, client, authority/i);
  });

  it('keeps the authority beside the party rather than instead of it', () => {
    // Two different questions: which SIDE signed, and on whose behalf. A client's own
    // representative witnessing is still the witness party.
    const rows = [
      makeSignoffEvidence({ ...base, party: 'commissioning_engineer', method: 'electronic', signedBy: 'A. Engineer' }),
      makeSignoffEvidence({ ...base, party: 'witness', method: 'electronic', signedBy: 'C. Client', authority: 'client' }),
    ];
    expect(evidenceForParty(rows, 'witness')?.authority).toBe('client');
    expect(evidenceForParty(rows, 'commissioning_engineer')?.authority).toBe('contractor');
  });
});

describe('what the test produced', () => {
  const attachment = { tenantId: 't1', commissioningId: 'rec-1', projectId: 'p1', fileId: 'doc-2' };

  it('records what the file is, who recorded it, and its checksum', () => {
    const a = makeCommissioningAttachment({
      ...attachment, category: 'instrument', description: 'Fluke output, camera 3',
      capturedBy: 'u-e2e-tc', hash: 'sha256:def',
    });
    expect(a.category).toBe('instrument');
    expect(a.capturedBy).toBe('u-e2e-tc');
    expect(a.hash).toBe('sha256:def');
  });

  it('defaults to a photograph, which is what a test mostly produces', () => {
    expect(makeCommissioningAttachment(attachment).category).toBe('photo');
  });

  it('refuses a category nobody declared', () => {
    expect(() => makeCommissioningAttachment({ ...attachment, category: 'invoice' as AttachmentCategory }))
      .toThrow(/must be one of photo, instrument, certificate, other/i);
  });

  it('refuses an attachment with no file', () => {
    expect(() => makeCommissioningAttachment({ ...attachment, fileId: '  ' })).toThrow(/fileId is required/i);
  });

  it('carries no signatory, because an attachment has none', () => {
    // The reason attachments are a separate table from the signatures: folding them together
    // would give every attachment a nullable party and every signature a nullable description,
    // and a surface reading either would have to guess which kind it had.
    const a = makeCommissioningAttachment({ ...attachment, capturedBy: 'u-e2e-tc' });
    expect(Object.keys(a)).not.toContain('signedBy');
    expect(Object.keys(a)).not.toContain('party');
  });
});
