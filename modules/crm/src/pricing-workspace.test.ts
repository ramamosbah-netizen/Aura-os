import { describe, it, expect } from 'vitest';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { quotationLinesFromSheet, applyPricingPolicy, freezeSheet, openCommercialPricing } from './domain/pricing-sheet';

// Slice 7 — the Pricing Workspace: the commercial decision on a read-only cost baseline.
//   Approved Estimate → Pricing Draft → set policy → Freeze → Quotation
// Cost is never touched here; the selling price is computed by the ONE engine, shown both ways.

function harness() {
  const store = new InMemoryPreAwardPackageStore();
  const service = new PreAwardPackageService(store, new InMemoryPricingSheetStore());
  return { store, service };
}

/** Drive scope + a cost-only approved estimate; return the opportunity id + baseline cost. */
async function approvedEstimate(service: PreAwardPackageService, oppId: string, unitCost = 1000, qty = 4, overhead = 10) {
  const pkg = await service.openDirect({ tenantId: 't1', opportunityId: oppId });
  const basis = await service.addScopeBasis({ tenantId: 't1', packageId: pkg.id, sourceId: 's', lines: [{ lineId: 'L1', description: 'CCTV', unit: 'no', quantity: qty, sourceLineId: 'R1' }] });
  await service.approveScopeBasisById('t1', pkg.id, basis.id, 'm1');
  const { estimate } = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines, buildUps: [{ basisLineId: 'L1', resources: { supplyUnitPrice: unitCost }, overheadPercent: overhead }] });
  await service.approveEstimateRevision(await service.freezeEstimateRevision(estimate, 'u1'), 'm1');
  return { pkg, baseline: estimate.totals.estimatedCost }; // (unitCost×(1+oh))×qty
}

describe('domain — the commercial decision is cost-in, price-out', () => {
  it('a fresh draft carries the cost baseline and no decision', () => {
    const s = openCommercialPricing({ tenantId: 't1', name: 'p', opportunityId: 'o1', packageId: 'pk1', estimateRevisionId: 'e1', baselineCost: 4400 });
    expect(s.status).toBe('draft');
    expect(s.commercial).toMatchObject({ baselineCost: 4400, policy: null, figures: null });
    expect(s.totals.totalSell).toBe(0);
  });

  it('applyPricingPolicy shows BOTH margin and markup, and they differ', () => {
    const draft = openCommercialPricing({ tenantId: 't1', name: 'p', opportunityId: 'o1', packageId: 'pk1', estimateRevisionId: 'e1', baselineCost: 100 });
    const margin = applyPricingPolicy(draft, { method: 'target_margin', percent: 15 }, null);
    expect(margin.totals.totalSell).toBe(117.65);
    expect(margin.commercial!.figures!.marginPercent).toBeCloseTo(15, 1);
    expect(margin.commercial!.figures!.markupPercent).toBeCloseTo(17.65, 1);
    const markup = applyPricingPolicy(draft, { method: 'markup', percent: 15 }, null);
    expect(markup.totals.totalSell).toBe(115);
    expect(markup.commercial!.figures!.marginPercent).toBeCloseTo(13.0435, 3);
    expect(margin.totals.totalSell).not.toBe(markup.totals.totalSell);
  });

  it('a discount lowers the sell and the realised margin', () => {
    const draft = openCommercialPricing({ tenantId: 't1', name: 'p', opportunityId: 'o1', packageId: 'pk1', estimateRevisionId: 'e1', baselineCost: 4400 });
    const priced = applyPricingPolicy(draft, { method: 'markup', percent: 30 }, { kind: 'amount', value: 200 });
    expect(priced.commercial!.figures!.preDiscountSell).toBe(5720);
    expect(priced.commercial!.figures!.discount).toBe(200);
    expect(priced.totals.totalSell).toBe(5520);
  });

  it('freezing without a policy is refused; a frozen sheet cannot be re-priced', () => {
    const draft = openCommercialPricing({ tenantId: 't1', name: 'p', opportunityId: 'o1', packageId: 'pk1', estimateRevisionId: 'e1', baselineCost: 4400 });
    expect(() => freezeSheet(draft, 'u1')).toThrow(/without a policy/i);
    const priced = applyPricingPolicy(draft, { method: 'target_margin', percent: 20 }, null);
    const frozen = freezeSheet(priced, 'u1');
    expect(frozen.status).toBe('frozen');
    expect(() => applyPricingPolicy(frozen, { method: 'markup', percent: 5 }, null)).toThrow(/only a draft/i);
  });
});

describe('service — the pricing lifecycle', () => {
  it('no pricing before an approved estimate; then draft → policy → freeze → quotation', async () => {
    const { service } = harness();
    // No package yet, and (after a package + basis) no approved estimate — pricing cannot start.
    await expect(service.openPricing({ tenantId: 't1', opportunityId: 'o1' })).rejects.toThrow(/pre-award package is required|approved estimate/i);

    await approvedEstimate(service, 'o1'); // baseline 4400
    const draft = await service.openPricing({ tenantId: 't1', opportunityId: 'o1', actorId: 'sales' });
    expect(draft.commercial!.baselineCost).toBe(4400);
    // idempotent
    expect((await service.openPricing({ tenantId: 't1', opportunityId: 'o1' })).id).toBe(draft.id);
    // no freeze without policy
    await expect(service.freezePricingSheetById({ tenantId: 't1', opportunityId: 'o1', sheetId: draft.id })).rejects.toThrow(/without a policy/i);

    const priced = await service.setPricingPolicy({ tenantId: 't1', opportunityId: 'o1', sheetId: draft.id, policy: { method: 'target_margin', percent: 25 } });
    expect(priced.totals.totalSell).toBe(5866.67); // 4400 / 0.75
    const frozen = await service.freezePricingSheetById({ tenantId: 't1', opportunityId: 'o1', sheetId: draft.id, actorId: 'sales' });
    expect(frozen.status).toBe('frozen');

    const net = quotationLinesFromSheet(frozen).reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    expect(Math.round(net * 100) / 100).toBe(5866.67); // quote = frozen sheet
  });

  it('preview equals what setPolicy persists', async () => {
    const { service } = harness();
    await approvedEstimate(service, 'o1');
    const draft = await service.openPricing({ tenantId: 't1', opportunityId: 'o1' });
    const preview = await service.previewPricing({ tenantId: 't1', opportunityId: 'o1', policy: { method: 'markup', percent: 22 } });
    const priced = await service.setPricingPolicy({ tenantId: 't1', opportunityId: 'o1', sheetId: draft.id, policy: { method: 'markup', percent: 22 } });
    expect(priced.commercial!.figures!.sellingPrice).toBe(preview.figures.sellingPrice);
  });

  it('re-pricing after freeze is P-002; P-001 stays frozen', async () => {
    const { service } = harness();
    await approvedEstimate(service, 'o1');
    const draft = await service.openPricing({ tenantId: 't1', opportunityId: 'o1' });
    await service.setPricingPolicy({ tenantId: 't1', opportunityId: 'o1', sheetId: draft.id, policy: { method: 'target_margin', percent: 20 } });
    const frozen = await service.freezePricingSheetById({ tenantId: 't1', opportunityId: 'o1', sheetId: draft.id });

    // openPricing now returns the frozen sheet (read-only), not a new draft.
    expect((await service.openPricing({ tenantId: 't1', opportunityId: 'o1' })).id).toBe(frozen.id);
    const p2 = await service.openPricingRevision({ tenantId: 't1', opportunityId: 'o1', actorId: 'sales' });
    expect(p2.version).toBe(2);
    expect(p2.parentSheetId).toBe(frozen.id);
    expect(p2.status).toBe('draft');
  });
});
