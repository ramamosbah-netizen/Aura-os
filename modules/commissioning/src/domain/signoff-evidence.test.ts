import { describe, expect, it } from 'vitest';
import {
  type SignedCommissioningResult,
  type SignoffEvidence,
  commissioningResultHash,
  evidenceForParty,
  makeSignoffEvidence,
  signoffCoversResult,
  signoffIsSigned,
} from './signoff-evidence';

/**
 * XOP-12 / TC-06 — A WITNESSED SIGN-OFF THAT HOLDS SOMETHING FROM THE WITNESS.
 *
 * `commissionedBy` and `witnessedBy` have been required since the record existed, and both are
 * free text typed by whoever was at the keyboard. The evidence pack printed two blank ruled lines
 * beneath a note describing "the witnessed sign-off", so the document asserted a witnessed
 * sign-off and held nothing at all from the witness.
 *
 * The three rules this defends are the ones the certificate turns on: who signed is not who
 * recorded it, a signature covers a RESULT rather than a row id, and an emailed confirmation is
 * not a signature.
 */

const RESULT: SignedCommissioningResult = {
  code: 'TC-CCTV-01',
  system: 'cctv',
  testDate: '2026-09-22',
  pointsPassed: 12,
  pointsTotal: 12,
};

const base = {
  tenantId: 't1',
  commissioningId: 'rec-1',
  projectId: 'p1',
  documentId: 'doc-1',
  documentHash: 'sha256:abc',
  signedContentHash: commissioningResultHash(RESULT),
};

describe('who signed is not who recorded it', () => {
  it('keeps the signatory and the recorder apart', () => {
    const e = makeSignoffEvidence({
      ...base, party: 'witness', method: 'electronic',
      signedBy: 'R. Consultant', recordedBy: 'u-e2e-tc',
    });
    expect(e.signedBy).toBe('R. Consultant');
    expect(e.recordedBy).toBe('u-e2e-tc');
  });

  it('refuses evidence that does not name its signatory', () => {
    // No fallback to the recording user. A fallback is the defect, not a milder version of it:
    // the certificate would resume printing "Signed by <whoever was at the keyboard>".
    expect(() => makeSignoffEvidence({ ...base, party: 'witness', method: 'electronic', signedBy: '  ', recordedBy: 'u-e2e-tc' }))
      .toThrow(/requires the name of the person who signed/i);
  });

  it('refuses a party outside the two the sign-off has', () => {
    expect(() => makeSignoffEvidence({
      ...base, party: 'client' as SignoffEvidence['party'], method: 'electronic', signedBy: 'X',
    })).toThrow(/party must be one of/i);
  });

  it('refuses a reference with no checksum, and evidence that says nothing about what it covers', () => {
    expect(() => makeSignoffEvidence({ ...base, documentHash: '', party: 'witness', method: 'electronic', signedBy: 'X' }))
      .toThrow(/both the stored document and its checksum/i);
    expect(() => makeSignoffEvidence({ ...base, signedContentHash: '', party: 'witness', method: 'electronic', signedBy: 'X' }))
      .toThrow(/must record what was signed/i);
  });
});

describe('what a sign-off signature covers', () => {
  it('changes with the result, not with the record id', () => {
    const h = commissioningResultHash(RESULT);
    expect(commissioningResultHash({ ...RESULT })).toBe(h);
    expect(commissioningResultHash({ ...RESULT, pointsTotal: 13 })).not.toBe(h);
    expect(commissioningResultHash({ ...RESULT, pointsPassed: 11 })).not.toBe(h);
    expect(commissioningResultHash({ ...RESULT, testDate: '2026-09-23' })).not.toBe(h);
    expect(commissioningResultHash({ ...RESULT, system: 'access_control' })).not.toBe(h);
  });

  it('does not collide when two values swap fields', () => {
    // Labelled and delimited: without that, a 12/12 record and a 12/12 record differing only in
    // where the numbers sat would hash alike.
    expect(commissioningResultHash({ ...RESULT, pointsPassed: 12, pointsTotal: 12 }))
      .not.toBe(commissioningResultHash({ ...RESULT, pointsPassed: 0, pointsTotal: 0 }));
  });

  it('reads current, superseded and unverifiable as three different answers', () => {
    const signed = commissioningResultHash(RESULT);
    expect(signoffCoversResult(signed, RESULT)).toBe('current');
    expect(signoffCoversResult(signed, { ...RESULT, pointsTotal: 20, pointsPassed: 20 })).toBe('superseded');
    expect(signoffCoversResult(null, RESULT)).toBe('unverifiable');
  });
});

describe('what the evidence pack may say about each party', () => {
  const sign = (party: SignoffEvidence['party'], method: SignoffEvidence['method']) =>
    makeSignoffEvidence({ ...base, party, method, signedBy: `${party} signatory`, recordedBy: 'u-e2e-tc' });

  it('calls only an electronic or paper signature SIGNED', () => {
    // An emailed confirmation from a consultant proves they accepted the result and proves they
    // did NOT sign. Printing it under a signature block would manufacture one out of a message.
    expect(signoffIsSigned(sign('witness', 'electronic'))).toBe(true);
    expect(signoffIsSigned(sign('witness', 'paper'))).toBe(true);
    expect(signoffIsSigned(sign('witness', 'email'))).toBe(false);
  });

  it('finds each party independently, and says nothing about one that did not sign', () => {
    const only = [sign('commissioning_engineer', 'electronic')];
    expect(evidenceForParty(only, 'commissioning_engineer')?.signedBy).toBe('commissioning_engineer signatory');
    // The engineer signing does not make the sign-off witnessed. This is the case the blank ruled
    // line used to hide.
    expect(evidenceForParty(only, 'witness')).toBeNull();
  });

  it('lets both parties name the same document, because one sheet can carry both signatures', () => {
    const engineer = sign('commissioning_engineer', 'paper');
    const witness = sign('witness', 'paper');
    expect(engineer.documentId).toBe(witness.documentId);
    expect(evidenceForParty([engineer, witness], 'witness')?.party).toBe('witness');
  });
});
