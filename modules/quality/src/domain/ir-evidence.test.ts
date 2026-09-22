import { describe, expect, it } from 'vitest';
import {
  type IrEvidence,
  type SignedInspectionResult,
  inspectionResultHash,
  makeIrEvidence,
  resolveInspectionSignature,
  signatureCoversInspection,
} from './ir-evidence';

/**
 * QHS-07 / XOP-12 — AN INSPECTION THAT KEEPS ITS EVIDENCE.
 *
 * Quality has never had an upload route, so an inspection request — the record that says a thing
 * was looked at and passed — could carry no photograph of what was looked at. The screen showed an
 * "Inspector / Witness Signature" pad the whole time, bound to state the submit payload never read.
 *
 * What is proved here is the domain's half: the signature names its signatory, only a signature
 * may, and what it covers is the inspection RESULT rather than the row it hangs off.
 */

const RESULT: SignedInspectionResult = {
  irNumber: 'IR-001',
  discipline: 'cctv',
  locationDetail: 'L3 riser, grid C4',
  inspectionDate: '2026-09-22',
  status: 'approved',
  approvedQuantity: 40,
  unit: 'm',
};

const base = { tenantId: 't1', inspectionId: 'ir-1', projectId: 'p1', fileId: 'doc-1' };

describe('who signed is not who uploaded', () => {
  it('keeps the signatory and the recorder apart', () => {
    const e = makeIrEvidence({
      ...base, category: 'signature', signedBy: 'R. Consultant', capturedBy: 'u-e2e-qaqc',
      signedContentHash: inspectionResultHash(RESULT),
    });
    expect(e.signedBy).toBe('R. Consultant');
    expect(e.capturedBy).toBe('u-e2e-qaqc');
  });

  it('refuses a signature that does not name its signatory', () => {
    // No fallback to the uploading account: the fallback is the defect, and the printed IR would
    // resume reading "Signed by <whoever pressed the button>".
    expect(() => makeIrEvidence({ ...base, category: 'signature', capturedBy: 'u-e2e-qaqc' }))
      .toThrow(/requires the name of the person who signed/i);
  });

  it('refuses a signatory on evidence that is not a signature', () => {
    // Otherwise a photograph could carry one and a surface would have two places to look.
    expect(() => makeIrEvidence({ ...base, category: 'photo', signedBy: 'R. Consultant' }))
      .toThrow(/only a signature may name a signatory/i);
  });

  it('leaves a photograph with no signatory at all', () => {
    const photo = makeIrEvidence({ ...base, category: 'photo', capturedBy: 'u-e2e-qaqc' });
    expect(photo.signedBy).toBeNull();
    expect(photo.capturedBy).toBe('u-e2e-qaqc');
  });
});

describe('what an inspection signature covers', () => {
  it('changes with the decision and the measured quantity', () => {
    const h = inspectionResultHash(RESULT);
    expect(inspectionResultHash({ ...RESULT })).toBe(h);
    expect(inspectionResultHash({ ...RESULT, status: 'rejected' })).not.toBe(h);
    expect(inspectionResultHash({ ...RESULT, approvedQuantity: 45 })).not.toBe(h);
    expect(inspectionResultHash({ ...RESULT, locationDetail: 'L4 riser' })).not.toBe(h);
    expect(inspectionResultHash({ ...RESULT, inspectionDate: '2026-09-23' })).not.toBe(h);
  });

  it('does not collide when a value moves between fields', () => {
    expect(inspectionResultHash({ ...RESULT, unit: 'm', approvedQuantity: 40 }))
      .not.toBe(inspectionResultHash({ ...RESULT, unit: '40', approvedQuantity: null }));
  });

  it('reads current, superseded and unverifiable as three different answers', () => {
    const signed = inspectionResultHash(RESULT);
    expect(signatureCoversInspection(signed, RESULT)).toBe('current');
    expect(signatureCoversInspection(signed, { ...RESULT, approvedQuantity: 60 })).toBe('superseded');
    expect(signatureCoversInspection(null, RESULT)).toBe('unverifiable');
  });
});

describe('which row is the signature', () => {
  const sign = (signedBy: string, result: SignedInspectionResult): IrEvidence =>
    makeIrEvidence({ ...base, category: 'signature', signedBy, signedContentHash: inspectionResultHash(result) });

  it('finds none where the inspection has only photographs', () => {
    expect(resolveInspectionSignature([makeIrEvidence({ ...base, category: 'photo' })], RESULT)).toBeNull();
  });

  it('is chosen by category, not by what the description happens to say', () => {
    // The daily report's certificate used to pick its signature with a regex over the uploader's
    // free text and printed a photo described "sign-off" AS the signature. Quality starts right.
    const decoy = makeIrEvidence({ ...base, category: 'photo', description: 'witness sign-off point' });
    const real = sign('R. Consultant', RESULT);
    expect(resolveInspectionSignature([decoy, real], RESULT)?.evidence.signedBy).toBe('R. Consultant');
  });

  it('takes the later signature when a re-measured inspection was signed again', () => {
    const first = sign('R. Consultant', { ...RESULT, approvedQuantity: 10 });
    const second = sign('S. Engineer', RESULT);
    const found = resolveInspectionSignature([first, second], RESULT);
    expect(found?.evidence.signedBy).toBe('S. Engineer');
    expect(found?.coverage).toBe('current');
  });

  it('reports a stale signature as superseded rather than dropping it', () => {
    // It must stay visible: that the inspection was signed and then re-measured is exactly what
    // somebody valuing the approved quantity needs to see.
    const found = resolveInspectionSignature([sign('R. Consultant', RESULT)], { ...RESULT, approvedQuantity: 95 });
    expect(found?.evidence.signedBy).toBe('R. Consultant');
    expect(found?.coverage).toBe('superseded');
  });
});
