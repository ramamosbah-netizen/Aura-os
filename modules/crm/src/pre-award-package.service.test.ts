import { describe, it, expect } from 'vitest';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { quotationReadiness } from './domain/quotation-readiness';

function svc() {
  const store = new InMemoryPreAwardPackageStore();
  return { store, service: new PreAwardPackageService(store) };
}
const lines = [{ lineId: 'L1', description: 'IP camera', unit: 'no', quantity: 10, sourceLineId: 'S1' }];
const buildUps = [{ basisLineId: 'L1', components: [{ costType: 'material' as const, description: 'Camera', quantity: 1, unitCost: 800 }], overheadPercent: 10, profitPercent: 15 }];
const gateFor = async (service: PreAwardPackageService, oppId: string) => {
  const g = await service.governance('t1', oppId);
  return quotationReadiness({ stage: 'proposal', executionType: 'direct_sale', tenderId: null }, g);
};

describe('Direct Pre-Award — governance loop closes', () => {
  it('opens a package idempotently', async () => {
    const { service } = svc();
    const a = await service.openDirect({ tenantId: 't1', opportunityId: 'opp-1' });
    const b = await service.openDirect({ tenantId: 't1', opportunityId: 'opp-1' });
    expect(a.id).toBe(b.id);
    expect(a.route).toBe('direct');
  });

  it('a freshly opened package is governed but NOT quotable (chain incomplete)', async () => {
    const { service } = svc();
    await service.openDirect({ tenantId: 't1', opportunityId: 'opp-1' });
    const g = await service.governance('t1', 'opp-1');
    expect(g).toMatchObject({ governed: true, scopeApproved: false, estimateApproved: false, pricingFrozen: false });
    const r = await gateFor(service, 'opp-1');
    expect(r.ready).toBe(false);
    expect(r.gaps.map((x) => x.code).sort()).toEqual(['ESTIMATE_NOT_APPROVED', 'PRICING_NOT_FROZEN', 'SCOPE_NOT_APPROVED']);
  });

  it('approving scope + estimate + freezing pricing makes it quotable — via the shared rate engine', async () => {
    const { service } = svc();
    const pkg = await service.openDirect({ tenantId: 't1', opportunityId: 'opp-1' });

    const basis = await service.addScopeBasis({ tenantId: 't1', packageId: pkg.id, sourceId: 'scope-1', lines });
    await service.approveScopeBasis(basis, 'u1');

    const { estimate, buildUps: bus } = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines, buildUps });
    // shared computeBuildUp: direct 800 → +10% overhead → +15% profit on (800+80) = 880*1.15 = 1012
    expect(bus[0].sellingRate).toBe(1012);
    expect((estimate.totals as { totalSellingValue: number }).totalSellingValue).toBe(10120); // ×10 qty
    const frozen = await service.freezeEstimateRevision(estimate, 'u1');
    await service.approveEstimateRevision(frozen, 'u2');

    // still missing pricing freeze
    expect((await gateFor(service, 'opp-1')).gaps.map((x) => x.code)).toEqual(['PRICING_NOT_FROZEN']);

    await service.markPricingFrozen('t1', pkg.id, true);
    const g = await service.governance('t1', 'opp-1');
    expect(g).toMatchObject({ governed: true, scopeApproved: true, estimateApproved: true, pricingFrozen: true });
    expect((await gateFor(service, 'opp-1')).ready).toBe(true);
  });
});
