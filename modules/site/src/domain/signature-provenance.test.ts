import { describe, expect, it } from 'vitest';
import { dailyReportContentHash, signatureCoversContent, type SignedReportContent } from './daily-report';
import { makeSiteEvidence, resolveReportSignature, type SiteEvidence } from './daily-report-lines';

/**
 * XOP-12 — A SIGNATURE NAMES ITS SIGNER AND THE CONTENT IT COVERS.
 *
 * SIT-04 closed the round trip: a signature drawn on the daily report is stored, reloaded and
 * downloadable by the people who review the day. Two things underneath it were still wrong, and
 * both showed up on the CONTROLLED SHEET rather than in the data:
 *
 *   1. The sheet printed `Signed by ${capturedBy}`, and `capturedBy` falls back to `createdBy` —
 *      the account that uploaded the file. On a pad labelled "Supervisor Sign-off" filled in at
 *      the tablet by the site engineer, the document credited the RECORDER with the foreman's act.
 *
 *   2. The signature was bound to the report id, not to what the report said. `rejected` returns
 *      a report to `draft`, the narrative can then be edited, and the old signature kept printing
 *      as though the supervisor had agreed to the new text.
 *
 * Nothing here re-tests SIT-04's round trip; the regression that guards it is in the browser spec.
 */

const REPORT: SignedReportContent = {
  date: '2026-09-22',
  workDescription: 'Level 3 riser containment, 40m tray',
  manpowerCount: 6,
  equipmentCount: 2,
};

const base = { tenantId: 't1', dailyReportId: 'r1', projectId: 'p1', fileId: 'doc-1' };

describe('who signed is not who uploaded', () => {
  it('keeps the signatory and the recorder apart', () => {
    const e = makeSiteEvidence({
      ...base, category: 'signature', signedBy: 'A. Foreman', createdBy: 'u-e2e-site',
    });
    expect(e.signedBy).toBe('A. Foreman');
    expect(e.capturedBy).toBe('u-e2e-site');
  });

  it('never derives the signatory from whoever uploaded the file', () => {
    // The defect, stated as a test: if this ever falls back, the controlled sheet starts
    // crediting the recorder again and nothing else in the system would notice.
    expect(() => makeSiteEvidence({ ...base, category: 'signature', createdBy: 'u-e2e-site' }))
      .toThrow(/requires the name of the person who signed/i);
  });

  it('refuses a signatory on evidence that is not a signature', () => {
    // Otherwise a photograph could carry one and a surface would have a second place to look.
    expect(() => makeSiteEvidence({ ...base, category: 'progress', signedBy: 'A. Foreman' }))
      .toThrow(/only a signature may name a signatory/i);
  });

  it('leaves a photograph with no signatory at all', () => {
    const photo = makeSiteEvidence({ ...base, category: 'progress', createdBy: 'u-e2e-site' });
    expect(photo.signedBy).toBeNull();
    expect(photo.capturedBy).toBe('u-e2e-site');
  });
});

describe('what a signature covers', () => {
  it('is the same hash for the same content and a different one for any change', () => {
    const h = dailyReportContentHash(REPORT);
    expect(dailyReportContentHash({ ...REPORT })).toBe(h);
    expect(dailyReportContentHash({ ...REPORT, workDescription: 'Level 3 riser containment, 45m tray' })).not.toBe(h);
    expect(dailyReportContentHash({ ...REPORT, manpowerCount: 7 })).not.toBe(h);
    expect(dailyReportContentHash({ ...REPORT, date: '2026-09-23' })).not.toBe(h);
  });

  it('does not let a value moving between fields keep the same hash', () => {
    // Labelled and delimited rather than concatenated: without that, swapping the two counts
    // would hash identically and a corrected report would read as still signed.
    expect(dailyReportContentHash({ ...REPORT, manpowerCount: 2, equipmentCount: 6 }))
      .not.toBe(dailyReportContentHash(REPORT));
  });

  it('reads current, superseded and unverifiable as three different answers', () => {
    const signed = dailyReportContentHash(REPORT);
    expect(signatureCoversContent(signed, REPORT)).toBe('current');
    expect(signatureCoversContent(signed, { ...REPORT, workDescription: 'something else' })).toBe('superseded');
    // A signature taken before the column existed is a REAL signature that nobody checked.
    // Calling it a mismatch would accuse it of something; calling it current would assert more
    // than is known.
    expect(signatureCoversContent(null, REPORT)).toBe('unverifiable');
    expect(signatureCoversContent('   ', REPORT)).toBe('unverifiable');
  });
});

describe('which signature the report carries', () => {
  const sign = (signedBy: string, content: SignedReportContent | null): SiteEvidence =>
    makeSiteEvidence({
      ...base, category: 'signature', signedBy,
      signedContentHash: content ? dailyReportContentHash(content) : undefined,
    });

  it('finds none where the day has only photographs', () => {
    const photos = [makeSiteEvidence({ ...base, category: 'progress' })];
    expect(resolveReportSignature(photos, REPORT)).toBeNull();
  });

  it('is chosen by category, not by what the description happens to say', () => {
    // The whole defect: the sheet used `/signature|sign-off/i` over the uploader's free text, so
    // a progress photo described this way was printed AS the signature.
    const decoy = makeSiteEvidence({ ...base, category: 'progress', description: 'riser sign-off point' });
    const real = sign('A. Foreman', REPORT);
    const found = resolveReportSignature([decoy, real], REPORT);
    expect(found?.evidence.signedBy).toBe('A. Foreman');
    expect(found?.coverage).toBe('current');
  });

  it('takes the later signature when a corrected day was signed again', () => {
    const first = sign('A. Foreman', { ...REPORT, workDescription: 'first version' });
    const second = sign('B. Supervisor', REPORT);
    const found = resolveReportSignature([first, second], REPORT);
    expect(found?.evidence.signedBy).toBe('B. Supervisor');
    expect(found?.coverage).toBe('current');
  });

  it('reports a stale signature as superseded rather than dropping it', () => {
    // It must stay visible: that the day was signed once and then changed is exactly what
    // somebody checking a progress claim needs to see.
    const found = resolveReportSignature([sign('A. Foreman', REPORT)], { ...REPORT, manpowerCount: 9 });
    expect(found?.evidence.signedBy).toBe('A. Foreman');
    expect(found?.coverage).toBe('superseded');
  });
});
