import { describe, it, expect } from 'vitest';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { quotationReadiness } from './domain/quotation-readiness';

function svc() {
  const store = new InMemoryPreAwardPackageStore();
  const pricing = new InMemoryPricingSheetStore();
  return { store, pricing, service: new PreAwardPackageService(store, pricing) };
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
    // Slice 6A: the estimate is COST-ONLY. direct 800 → +10% delivery overhead = 880 estimated cost
    // per unit; profitPercent is ignored here (no selling decision at estimate time).
    expect(bus[0].sellingRate).toBe(880);          // per-unit ESTIMATED COST, not a price
    expect(bus[0].profitAmount).toBe(0);
    expect((estimate.totals as { estimatedCost: number }).estimatedCost).toBe(8800); // ×10 qty
    expect('totalSellingValue' in estimate.totals).toBe(false); // no selling number on the estimate
    const frozen = await service.freezeEstimateRevision(estimate, 'u1');
    await service.approveEstimateRevision(frozen, 'u2');

    // still missing pricing freeze
    expect((await gateFor(service, 'opp-1')).gaps.map((x) => x.code)).toEqual(['PRICING_NOT_FROZEN']);

    // The selling decision is made HERE, once, with an explicit policy. 15% markup on 8800 = 10120 —
    // the same number the old estimate-baked 15% produced, proving the boundary is faithful.
    const sheet = await service.freezePricing({ tenantId: 't1', opportunityId: 'opp-1', policy: { method: 'markup', percent: 15 }, actorId: 'u1' });
    expect(sheet.status).toBe('frozen');
    expect(sheet.packageId).toBe(pkg.id);
    expect(sheet.estimateRevisionId).toBe(frozen.id);
    expect(sheet.totals.totalSell).toBe(10120); // forward from the policy, not reverse-engineered

    const g = await service.governance('t1', 'opp-1');
    expect(g).toMatchObject({ governed: true, scopeApproved: true, estimateApproved: true, pricingFrozen: true });
    expect((await gateFor(service, 'opp-1')).ready).toBe(true);
  });

  it('freezePricing refuses when no approved estimate exists, and is idempotent once frozen', async () => {
    const { service } = svc();
    const pkg = await service.openDirect({ tenantId: 't1', opportunityId: 'opp-2' });
    const basis = await service.addScopeBasis({ tenantId: 't1', packageId: pkg.id, sourceId: 'scope-1', lines });
    await service.approveScopeBasis(basis, 'u1');
    await expect(service.freezePricing({ tenantId: 't1', opportunityId: 'opp-2' })).rejects.toThrow(/approved estimate/i);

    const { estimate } = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines, buildUps });
    const fe = await service.freezeEstimateRevision(estimate, 'u1');
    await service.approveEstimateRevision(fe, 'u2');

    const policy = { method: 'markup' as const, percent: 15 };
    const first = await service.freezePricing({ tenantId: 't1', opportunityId: 'opp-2', policy });
    const second = await service.freezePricing({ tenantId: 't1', opportunityId: 'opp-2', policy });
    expect(second.id).toBe(first.id); // no second frozen sheet; the policy is not re-applied
  });

  it('freezePricing REFUSES a cost-only estimate with no pricing policy — pricing is a decision', async () => {
    const { service } = svc();
    const pkg = await service.openDirect({ tenantId: 't1', opportunityId: 'opp-3' });
    const basis = await service.addScopeBasis({ tenantId: 't1', packageId: pkg.id, sourceId: 'scope-1', lines });
    await service.approveScopeBasis(basis, 'u1');
    const { estimate } = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines, buildUps });
    const fe = await service.freezeEstimateRevision(estimate, 'u1');
    await service.approveEstimateRevision(fe, 'u2');
    await expect(service.freezePricing({ tenantId: 't1', opportunityId: 'opp-3' })).rejects.toThrow(/pricing policy is required/i);
  });

  it('target-margin and markup policies produce different, forward-computed prices', async () => {
    const setup = async (oppId: string) => {
      const { service } = svc();
      const pkg = await service.openDirect({ tenantId: 't1', opportunityId: oppId });
      const basis = await service.addScopeBasis({ tenantId: 't1', packageId: pkg.id, sourceId: 's', lines });
      await service.approveScopeBasis(basis, 'u1');
      const { estimate } = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines, buildUps });
      await service.approveEstimateRevision(await service.freezeEstimateRevision(estimate, 'u1'), 'u2');
      return service;
    };
    // estimatedCost = 8800.
    const a = await (await setup('opp-tm')).freezePricing({ tenantId: 't1', opportunityId: 'opp-tm', policy: { method: 'target_margin', percent: 20 } });
    const b = await (await setup('opp-mu')).freezePricing({ tenantId: 't1', opportunityId: 'opp-mu', policy: { method: 'markup', percent: 20 } });
    expect(a.totals.totalSell).toBe(11000);   // 8800 / (1 - 0.20)
    expect(b.totals.totalSell).toBe(10560);   // 8800 × 1.20
    expect(a.totals.totalSell).not.toBe(b.totals.totalSell);
  });
});
