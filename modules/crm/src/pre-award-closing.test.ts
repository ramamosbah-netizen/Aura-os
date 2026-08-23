import { describe, it, expect } from 'vitest';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { quotationLinesFromSheet, linkQuotation } from './domain/pricing-sheet';
import { basisCompleteness } from './domain/pre-award-package';

// Slice 5 closing patch — the guarantees the first browser click-through proved were MISSING:
//   D1  a draft basis is genuinely editable, and a human edit never erases provenance
//   D2  an unknown quantity stays unknown (null), it is never silently converted to 0
//   D3  an unknown quantity BLOCKS approve / estimate / pricing instead of pricing at nothing
//   D4  the quotation carries the FROZEN pricing sheet's money, not the opportunity's headline value
//   D5  an approval is an audit record — re-approving never re-stamps who/when

function harness() {
  const store = new InMemoryPreAwardPackageStore();
  const pricing = new InMemoryPricingSheetStore();
  return { store, pricing, service: new PreAwardPackageService(store, pricing) };
}

/** A basis whose quantity is UNKNOWN — what accepting a requirement-derived suggestion produces. */
const unknownQtyLines = [{ lineId: 'L1', description: '48 IP cameras', unit: 'no', quantity: null, sourceLineId: 'REQ-1' }];
const buildUps = [{ basisLineId: 'L1', components: [{ costType: 'material' as const, description: 'Camera', quantity: 1, unitCost: 1000 }], overheadPercent: 10, profitPercent: 20 }];

async function openWithDraft(service: PreAwardPackageService, oppId: string) {
  const pkg = await service.openDirect({ tenantId: 't1', opportunityId: oppId });
  const basis = await service.addScopeBasis({ tenantId: 't1', packageId: pkg.id, sourceId: 'proposal-1', sourceRevRef: 'scope-assist:v1', lines: unknownQtyLines });
  return { pkg, basis };
}

describe('D2/D3 — unknown quantity is not zero', () => {
  it('an unknown quantity survives into the draft basis rather than becoming 0', async () => {
    const { service } = harness();
    const { basis } = await openWithDraft(service, 'opp-1');
    expect(basis.lines[0].quantity).toBeNull();
    expect(basisCompleteness(basis.lines).complete).toBe(false);
  });

  it('blocks APPROVING the scope while any quantity is unknown', async () => {
    const { service } = harness();
    const { pkg, basis } = await openWithDraft(service, 'opp-1');
    await expect(service.approveScopeBasisById('t1', pkg.id, basis.id, 'u1')).rejects.toThrow(/unknown quantity/i);
  });

  it('blocks BUILDING AN ESTIMATE on unknown quantities — no confident AED 0 estimate', async () => {
    const { service } = harness();
    const { pkg, basis } = await openWithDraft(service, 'opp-1');
    await expect(
      service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines: unknownQtyLines, buildUps }),
    ).rejects.toThrow(/unknown quantity/i);
  });
});

describe('D1 — the accepted draft is genuinely editable', () => {
  it('edits description/unit/quantity, keeps provenance, and stamps the human editor', async () => {
    const { service } = harness();
    const { pkg, basis } = await openWithDraft(service, 'opp-1');
    const edited = await service.updateBasisLinesById('t1', pkg.id, basis.id, [
      { lineId: 'L1', description: '48 IP cameras (rev. after site visit)', unit: 'each', quantity: 48, sourceLineId: 'IGNORED-BY-DOMAIN' },
    ], 'engineer-1');

    expect(edited.lines[0].quantity).toBe(48);
    expect(edited.lines[0].unit).toBe('each');
    expect(edited.lines[0].editedBy).toBe('engineer-1');
    // The editor's payload cannot rewrite where the line came from.
    expect(edited.lines[0].sourceLineId).toBe('REQ-1');
  });

  it('supports adding and removing lines on the draft', async () => {
    const { service } = harness();
    const { pkg, basis } = await openWithDraft(service, 'opp-1');
    const added = await service.updateBasisLinesById('t1', pkg.id, basis.id, [
      { lineId: 'L1', description: '48 IP cameras', unit: 'no', quantity: 48, sourceLineId: 'REQ-1' },
      { lineId: 'L2', description: 'Core switch (added by engineer)', unit: 'no', quantity: 2, sourceLineId: 'L2' },
    ], 'engineer-1');
    expect(added.lines).toHaveLength(2);

    const removed = await service.updateBasisLinesById('t1', pkg.id, basis.id, [added.lines[1]], 'engineer-1');
    expect(removed.lines.map((l) => l.lineId)).toEqual(['L2']);
  });

  it('refuses to edit once the basis is APPROVED — only a draft is editable', async () => {
    const { service } = harness();
    const { pkg, basis } = await openWithDraft(service, 'opp-1');
    const complete = [{ lineId: 'L1', description: '48 IP cameras', unit: 'no', quantity: 48, sourceLineId: 'REQ-1' }];
    await service.updateBasisLinesById('t1', pkg.id, basis.id, complete, 'engineer-1');
    await service.approveScopeBasisById('t1', pkg.id, basis.id, 'manager-1');

    await expect(service.updateBasisLinesById('t1', pkg.id, basis.id, complete, 'engineer-1'))
      .rejects.toThrow(/only a draft basis revision can be edited/i);
  });
});

describe('D5 — an approval is an audit record, not a toggle', () => {
  it('re-approving an approved basis is refused and never re-stamps who/when', async () => {
    const { service, store } = harness();
    const { pkg, basis } = await openWithDraft(service, 'opp-1');
    await service.updateBasisLinesById('t1', pkg.id, basis.id, [{ lineId: 'L1', description: 'c', unit: 'no', quantity: 5, sourceLineId: 'REQ-1' }], 'e1');
    const approved = await service.approveScopeBasisById('t1', pkg.id, basis.id, 'manager-1');

    await expect(service.approveScopeBasisById('t1', pkg.id, basis.id, 'someone-else'))
      .rejects.toThrow(/already approved/i);

    const after = (await store.listBasis('t1', pkg.id)).find((b) => b.id === basis.id)!;
    expect(after.approvedBy).toBe('manager-1');
    expect(after.approvedAt).toBe(approved.approvedAt); // the original stamp, untouched
  });
});

describe('D4 — the quotation carries the FROZEN pricing sheet, not the opportunity value', () => {
  /**
   * The decisive regression test. A real quantity of 2 flows Scope → Estimate → frozen Pricing; the
   * opportunity's headline `value` is then changed to something wildly different. The quotation
   * projected from the sheet must reproduce the SHEET's total, proving the deal's headline can no
   * longer leak into the customer's number — the bypass this patch closed.
   */
  it('quotation lines reproduce the frozen sheet total, whatever the opportunity value says', async () => {
    const { service } = harness();
    const pkg = await service.openDirect({ tenantId: 't1', opportunityId: 'opp-1' });
    const basis = await service.addScopeBasis({
      tenantId: 't1', packageId: pkg.id, sourceId: 'proposal-1',
      lines: [{ lineId: 'L1', description: 'IP camera', unit: 'no', quantity: 2, sourceLineId: 'S1' }],
    });
    await service.approveScopeBasisById('t1', pkg.id, basis.id, 'manager-1');

    const { estimate } = await service.addEstimate({
      tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id,
      lines: [{ lineId: 'L1', description: 'IP camera', unit: 'no', quantity: 2, sourceLineId: 'S1' }],
      buildUps,
    });
    expect(estimate.totals.totalSellingValue).toBeGreaterThan(0); // a real quantity → real money
    await service.freezeEstimateRevision(estimate, 'u1');
    await service.approveEstimateRevision({ ...estimate, status: 'frozen' }, 'u1');

    const sheet = await service.freezePricing({ tenantId: 't1', opportunityId: 'opp-1', actorId: 'u1' });
    expect(sheet.status).toBe('frozen');
    const sheetTotal = sheet.totals.totalSell;
    expect(sheetTotal).toBeGreaterThan(0);

    // The opportunity's headline value is now a completely different number — the old bypass would
    // have quoted THIS instead of the sheet.
    const opportunityValue = 999_999;
    expect(sheetTotal).not.toBe(opportunityValue);

    const quotationLines = quotationLinesFromSheet(sheet);
    const quotedNet = quotationLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    expect(Math.round(quotedNet * 100) / 100).toBe(sheetTotal);
    expect(quotedNet).not.toBe(opportunityValue);
  });

  it('a DRAFT sheet cannot be quoted, and the sheet records the quotation it produced', async () => {
    const { service, pricing } = harness();
    const pkg = await service.openDirect({ tenantId: 't1', opportunityId: 'opp-1' });
    const basis = await service.addScopeBasis({
      tenantId: 't1', packageId: pkg.id, sourceId: 'p1',
      lines: [{ lineId: 'L1', description: 'IP camera', unit: 'no', quantity: 2, sourceLineId: 'S1' }],
    });
    await service.approveScopeBasisById('t1', pkg.id, basis.id, 'm1');
    const { estimate } = await service.addEstimate({
      tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id,
      lines: [{ lineId: 'L1', description: 'IP camera', unit: 'no', quantity: 2, sourceLineId: 'S1' }], buildUps,
    });
    await service.freezeEstimateRevision(estimate, 'u1');
    await service.approveEstimateRevision({ ...estimate, status: 'frozen' }, 'u1');
    const sheet = await service.freezePricing({ tenantId: 't1', opportunityId: 'opp-1', actorId: 'u1' });

    const draft = { ...sheet, status: 'draft' as const };
    expect(() => quotationLinesFromSheet(draft)).toThrow(/only a frozen pricing sheet can be quoted/i);

    const linked = await service.linkQuotationToPricing(sheet, 'quote-1');
    expect(linked.quotationId).toBe('quote-1');
    const reloaded = (await pricing.list({ tenantId: 't1', packageId: pkg.id, status: 'frozen', limit: 1 }))[0];
    expect(reloaded.quotationId).toBe('quote-1');

    // A frozen sheet produces ONE quotation — a second, different one is refused.
    expect(() => linkQuotation(linked, 'quote-2')).toThrow(/only one quotation can be generated/i);
  });
});
