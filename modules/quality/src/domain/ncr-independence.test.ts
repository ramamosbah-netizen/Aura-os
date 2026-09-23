import { describe, expect, it } from 'vitest';
import {
  type Ncr,
  escalateNcr,
  makeNcr,
  markNcrCorrected,
  ncrOverdue,
  planNcrAction,
  verifyNcr,
} from './ncr';
import {
  type NcrEvidenceCategory,
  makeNcrEvidence,
  ncrEvidenceCoverage,
} from './ncr-evidence';

/**
 * QHS-03 — AN EVIDENCED NCR, CORRECTED BY ONE PERSON AND VERIFIED BY ANOTHER.
 *
 * "QA/QC raises an evidenced NCR; responsible owner corrects; INDEPENDENT verifier accepts or
 * rejects; overdue escalation and source work linkage persist."
 *
 * Nothing enforced the independence: one account could raise a non-conformance, mark it corrected
 * and close it, and the record would read as though three people had been involved. Nothing
 * carried evidence either, and with no due date nothing could be late — so there was nothing to
 * escalate.
 */

const base = { tenantId: 't1', projectId: 'p1', ncrNumber: 'NCR-001', description: 'Tray supports at 1.5m', severity: 'major' as const };

function corrected(correctedBy: string): Ncr {
  const raised = makeNcr({ ...base, raisedBy: 'u-qaqc' });
  const planned = planNcrAction(raised, { rootCause: 'Supports set out from the wrong datum', correctiveAction: 'Re-fix supports at 1.2m', assignedTo: correctedBy });
  return markNcrCorrected(planned, correctedBy);
}

describe('the verifier is not the person who did the repair', () => {
  it('refuses the corrector verifying their own correction', () => {
    // The whole point of the step. Without this the record reads as though three people were
    // involved when one account did everything.
    expect(() => verifyNcr(corrected('u-site'), true, 'u-site'))
      .toThrow(/may not verify it/i);
  });

  it('lets somebody else verify it', () => {
    const done = verifyNcr(corrected('u-site'), true, 'u-qaqc');
    expect(done.status).toBe('closed');
    expect(done.verifiedBy).toBe('u-qaqc');
  });

  it('refuses the corrector REJECTING it too, not only accepting', () => {
    // A rejection is still a verification decision, and letting the corrector make it would let
    // them cycle their own work indefinitely without anybody independent looking.
    expect(() => verifyNcr(corrected('u-site'), false, 'u-site')).toThrow(/may not verify it/i);
  });

  it('does NOT bar the raiser from verifying', () => {
    // Independent of the CORRECTION, not of the raiser. The QA/QC engineer who raised an NCR is
    // normally the right person to verify the fix; barring them would push the sign-off onto
    // somebody with less reason to look.
    const done = verifyNcr(corrected('u-site'), true, 'u-qaqc');
    expect(done.verifiedBy).toBe('u-qaqc');
  });
});

describe('overdue is a question with three answers', () => {
  const at = (iso: string) => new Date(iso);

  it('reads undated as its own answer, not as on-time', () => {
    // An NCR nobody gave a date to cannot be late, and a screen showing it as on-time is making
    // a claim nobody made.
    expect(ncrOverdue(makeNcr({ ...base }), at('2026-09-23T00:00:00Z'))).toBe('undated');
  });

  it('reads a future date as on-time and a past one as overdue', () => {
    const ncr = makeNcr({ ...base, dueAt: '2026-09-30T00:00:00Z' });
    expect(ncrOverdue(ncr, at('2026-09-23T00:00:00Z'))).toBe('on-time');
    expect(ncrOverdue(ncr, at('2026-10-01T00:00:00Z'))).toBe('overdue');
  });

  it('never calls a closed NCR overdue', () => {
    // It is finished, whatever date it finished after.
    const done = verifyNcr(corrected('u-site'), true, 'u-qaqc');
    expect(ncrOverdue({ ...done, dueAt: '2020-01-01T00:00:00Z' }, at('2026-09-23T00:00:00Z'))).toBe('closed');
  });
});

describe('escalating an overdue correction', () => {
  const late = () => makeNcr({ ...base, raisedBy: 'u-qaqc', dueAt: '2020-01-01T00:00:00Z' });

  it('records who escalated it, when, and what for', () => {
    const e = escalateNcr(late(), 'u-qaqc', 'Two weeks past the agreed date with no plan');
    expect(e.escalatedAt).toBeTruthy();
    expect(e.escalatedBy).toBe('u-qaqc');
    expect(e.escalationReason).toContain('Two weeks');
  });

  it('refuses to escalate something that is not late', () => {
    // An escalation raised against something on time is noise, and a register full of noise is
    // one nobody reads.
    expect(() => escalateNcr(makeNcr({ ...base, dueAt: '2099-01-01T00:00:00Z' }), 'u-qaqc', 'why'))
      .toThrow(/only an overdue NCR can be escalated/i);
  });

  it('refuses to escalate an undated NCR, and says what to do instead', () => {
    expect(() => escalateNcr(makeNcr({ ...base }), 'u-qaqc', 'why'))
      .toThrow(/set when the correction is due/i);
  });

  it('refuses a second escalation, which says nothing the first did not', () => {
    const once = escalateNcr(late(), 'u-qaqc', 'first');
    expect(() => escalateNcr(once, 'u-qaqc', 'again')).toThrow(/already been escalated/i);
  });

  it('requires a reason — the record has to say what it was escalated for', () => {
    expect(() => escalateNcr(late(), 'u-qaqc', '   ')).toThrow(/requires a reason/i);
  });
});

describe('which half of the NCR is evidenced', () => {
  const ev = { tenantId: 't1', ncrId: 'n1', projectId: 'p1', fileId: 'doc-1' };

  it('reports the two sides independently', () => {
    // An NCR with a photograph of the defect and nothing of the repair is in a different state
    // from one with neither, and a boolean cannot tell a reader which half is missing.
    expect(ncrEvidenceCoverage([])).toEqual({ raised: false, corrected: false });
    expect(ncrEvidenceCoverage([makeNcrEvidence({ ...ev, stage: 'raised' })])).toEqual({ raised: true, corrected: false });
    expect(ncrEvidenceCoverage([
      makeNcrEvidence({ ...ev, stage: 'raised' }),
      makeNcrEvidence({ ...ev, stage: 'corrected' }),
    ])).toEqual({ raised: true, corrected: true });
  });

  it('refuses a signature that does not name its signatory', () => {
    expect(() => makeNcrEvidence({ ...ev, category: 'signature', capturedBy: 'u-qaqc' }))
      .toThrow(/requires the name of the person who signed/i);
  });

  it('refuses a signatory on anything that is not a signature', () => {
    expect(() => makeNcrEvidence({ ...ev, category: 'photo', signedBy: 'A. Foreman' }))
      .toThrow(/only a signature may name a signatory/i);
  });

  it('refuses a stage or category nobody declared', () => {
    expect(() => makeNcrEvidence({ ...ev, stage: 'archived' as 'raised' })).toThrow(/stage must be one of raised, corrected/i);
    expect(() => makeNcrEvidence({ ...ev, category: 'invoice' as NcrEvidenceCategory })).toThrow(/category must be one of/i);
  });
});
