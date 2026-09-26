import { describe, expect, it } from 'vitest';
import {
  assertNoCommercialFigures,
  awaitingVerdict,
  complianceMatrixNumber,
  makeComplianceMatrixIssue,
  type ComplianceMatrixRow,
} from './domain/compliance-matrix';
import { InMemoryComplianceMatrixStore } from './in-memory-compliance-matrix-store';
import { row } from './compliance-matrix.fixture';

/**
 * EST-12 — the Technical Compliance Matrix (the owner's decision of 2026-09-25, "select (b)"):
 * issued by the Technical Manager from the verdicts as they stand, numbered and revisioned, a re-issue
 * carrying its reason, and never a commercial figure in it.
 */

const tender = { id: '6f3d9a2e-1111-2222-3333-444455556666', reference: 'TND-2026-000042' };
const base = { tenantId: 't1', tender, issuedBy: 'u-e2e-techmgr', documentId: 'doc-1', checksum: 'abc' };

describe('EST-12 — issuing the Technical Compliance Matrix', () => {
  it('Rev 0 freezes the verdicts, is numbered for the tender, and summarises them', () => {
    const issue = makeComplianceMatrixIssue({
      ...base, previous: null,
      rows: [row(), row({ quotationLineId: 'ql-2', supplierName: 'Gulf Vision', verdict: 'non_compliant', rationale: 'IR 15 m only' }),
        row({ quotationLineId: 'ql-3', supplierName: 'Emirates ELV', response: 'no_bid', verdict: null, rationale: null, evaluatedBy: null, evaluatedAt: null })],
    });
    expect(issue).toMatchObject({ matrixNumber: 'TCM-TND-2026-000042', revision: 0, reason: null, issuedBy: 'u-e2e-techmgr', supersededBy: null });
    expect(issue.summary).toEqual({ requirements: 1, offers: 3, compliant: 1, compliantWithDeviation: 0, nonCompliant: 1, noBid: 1 });
  });

  it('refuses an empty matrix, and a quoted line nobody has judged — naming it; a no-bid is never waited on', () => {
    expect(() => makeComplianceMatrixIssue({ ...base, previous: null, rows: [] })).toThrow(/requires at least one supplier offer/);
    const unjudged = row({ supplierName: 'Gulf Vision', verdict: null, rationale: null, evaluatedBy: null, evaluatedAt: null });
    expect(() => makeComplianceMatrixIssue({ ...base, previous: null, rows: [row(), unjudged] }))
      .toThrow(/requires the Technical Manager's verdict .* awaiting: Gulf Vision — CAM-4MP \(line 1\)/);
    expect(awaitingVerdict([row({ response: 'no_bid', verdict: null })])).toHaveLength(0);
  });

  it('a re-issue is the next revision, carries its reason, and only the current revision can be re-issued', () => {
    const rev0 = makeComplianceMatrixIssue({ ...base, previous: null, rows: [row()] });
    expect(() => makeComplianceMatrixIssue({ ...base, previous: rev0, rows: [row()] })).toThrow(/re-issuing the matrix requires a reason/);
    const rev1 = makeComplianceMatrixIssue({ ...base, previous: rev0, rows: [row({ verdict: 'compliant_with_deviation' })], reason: 'Al Noor amended their IR spec' });
    expect(rev1).toMatchObject({ matrixNumber: rev0.matrixNumber, revision: 1, reason: 'Al Noor amended their IR spec' });
    expect(() => makeComplianceMatrixIssue({ ...base, previous: { ...rev0, supersededBy: rev1.id }, rows: [row()], reason: 'again' }))
      .toThrow(/already superseded/);
  });

  it('refuses a commercial figure anywhere in the rows — it is a technical document', () => {
    expect(() => assertNoCommercialFigures([row()])).not.toThrow();
    const priced = { ...row(), offered: { ...row().offered, unitPrice: 420 } } as unknown as ComplianceMatrixRow;
    expect(() => makeComplianceMatrixIssue({ ...base, previous: null, rows: [priced] })).toThrow(/no commercial figures — rows\[0\]\.offered\.unitPrice/);
    expect(() => assertNoCommercialFigures([{ ...row(), currency: 'AED' }])).toThrow(/currency/);
  });

  it('needs an issuer, and names the matrix from the tender id when it has no reference', () => {
    expect(() => makeComplianceMatrixIssue({ ...base, issuedBy: null, previous: null, rows: [row()] })).toThrow(/authenticated Technical Manager/);
    expect(complianceMatrixNumber({ id: tender.id, reference: null })).toBe('TCM-6F3D9A2E');
  });
});

describe('EST-12 — the issued revisions are append-only', () => {
  it('supersedes the previous revision once, and refuses a duplicate revision', async () => {
    const store = new InMemoryComplianceMatrixStore();
    const rev0 = makeComplianceMatrixIssue({ ...base, previous: null, rows: [row()] });
    await store.issue(null, rev0, null);
    const rev1 = makeComplianceMatrixIssue({ ...base, previous: rev0, rows: [row()], reason: 'Re-judged after clarification' });
    await store.issue(null, rev1, rev0);
    const listed = await store.listByTender('t1', tender.id);
    expect(listed.map((i) => [i.revision, i.supersededBy])).toEqual([[1, null], [0, rev1.id]]);
    await expect(store.issue(null, { ...rev1, id: 'other' }, null)).rejects.toThrow(/already issued/);
    const rev2 = makeComplianceMatrixIssue({ ...base, previous: rev1, rows: [row()], reason: 'x' });
    await expect(store.issue(null, rev2, rev0)).rejects.toThrow(/already superseded/);
  });
});
