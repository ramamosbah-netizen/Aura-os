import { describe, it, expect } from 'vitest';
import {
  makePreAwardPackage, makeBasisRevision, approveBasis,
  makeEstimateRevision, freezeEstimate, approveEstimate, isEditable, packageGovernance,
  type EstimationBasisRevision, type EstimateRevision,
} from './domain/pre-award-package';

const basisLine = { lineId: 'l1', description: 'CCTV camera', unit: 'no', quantity: 10, sourceLineId: 'b1' };

describe('PreAwardPackage — owner XOR', () => {
  it('creates a direct package (opportunity owner)', () => {
    const p = makePreAwardPackage({ tenantId: 't1', opportunityId: 'opp-1' });
    expect(p.route).toBe('direct');
    expect(p.opportunityId).toBe('opp-1');
    expect(p.tenderId).toBeNull();
  });
  it('creates a tender package (tender owner)', () => {
    const p = makePreAwardPackage({ tenantId: 't1', tenderId: 'tnd-1' });
    expect(p.route).toBe('tender');
  });
  it('rejects zero or two owners', () => {
    expect(() => makePreAwardPackage({ tenantId: 't1' })).toThrow(/exactly one owner/);
    expect(() => makePreAwardPackage({ tenantId: 't1', opportunityId: 'o', tenderId: 't' })).toThrow(/exactly one owner/);
  });
});

describe('revision lifecycle', () => {
  it('basis: draft → approved; snapshot is frozen by value', () => {
    const lines = [{ ...basisLine }];
    const b = makeBasisRevision({ tenantId: 't1', packageId: 'p1', revisionNo: 1, sourceKind: 'scope', sourceId: 's1', lines });
    expect(b.status).toBe('draft');
    lines[0].quantity = 999; // mutate the caller's array
    expect(b.lines[0].quantity).toBe(10); // snapshot unaffected
    const a = approveBasis(b, 'u1');
    expect(a.status).toBe('approved');
    expect(a.approvedBy).toBe('u1');
  });

  it('estimate: freeze-on-reference then approve; frozen cannot be re-frozen; editable only while draft', () => {
    const e = makeEstimateRevision({ tenantId: 't1', packageId: 'p1', basisRevisionId: 'b1', revisionNo: 1, totals: { totalSellingValue: 100 } });
    expect(isEditable(e.status)).toBe(true);
    const f = freezeEstimate(e, 'u1');
    expect(f.status).toBe('frozen');
    expect(isEditable(f.status)).toBe(false);
    expect(() => freezeEstimate(f, 'u1')).toThrow(/only a draft estimate can be frozen/);
    const ap = approveEstimate(f, 'u2');
    expect(ap.status).toBe('approved');
    expect(ap.frozenAt).toBeTruthy();
  });

  it('revisionNo must be > 0', () => {
    expect(() => makeEstimateRevision({ tenantId: 't1', packageId: 'p1', basisRevisionId: 'b1', revisionNo: 0, totals: {} })).toThrow(/> 0/);
  });
});

describe('packageGovernance — mirrors the SQL derivation', () => {
  const b = (status: EstimationBasisRevision['status']) => ({ status } as EstimationBasisRevision);
  const e = (status: EstimateRevision['status']) => ({ status } as EstimateRevision);

  it('ungoverned when no package', () => {
    expect(packageGovernance(null, [], [], false).governed).toBe(false);
  });
  it('governed but chain incomplete → flags false', () => {
    const g = packageGovernance('p1', [b('draft')], [e('frozen')], false);
    expect(g).toMatchObject({ governed: true, scopeApproved: false, estimateApproved: false, pricingFrozen: false });
  });
  it('full chain → all true', () => {
    const g = packageGovernance('p1', [b('approved')], [e('approved')], true);
    expect(g).toMatchObject({ governed: true, scopeApproved: true, estimateApproved: true, pricingFrozen: true });
  });
});
