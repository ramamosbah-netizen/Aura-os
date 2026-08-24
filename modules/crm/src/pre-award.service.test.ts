import { describe, it, expect, vi } from 'vitest';
import type { EventStore, AccessService } from '@aura/core';
import { PreAwardService } from './pre-award.service';
import { InMemoryPreAwardStore } from './in-memory-pre-award-store';
import { QuotationService } from './quotation.service';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { InMemoryCommercialBaselineStore } from './in-memory-commercial-baseline-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';

function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const quotations = new QuotationService(new InMemoryQuotationStore(), new InMemoryCommercialBaselineStore(), events, { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService);
  const svc = new PreAwardService(new InMemoryPreAwardStore(), events, quotations);
  return { svc, quotations };
}

/** A PreAwardService WIRED to package governance — the composition the API actually runs. */
function governedHarness() {
  const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const quotations = new QuotationService(new InMemoryQuotationStore(), new InMemoryCommercialBaselineStore(), events, { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService);
  const packages = new PreAwardPackageService(new InMemoryPreAwardPackageStore(), new InMemoryPricingSheetStore());
  const svc = new PreAwardService(new InMemoryPreAwardStore(), events, quotations, packages);
  return { svc, quotations, packages };
}

const scopeInput = {
  tenantId: 't1', opportunityId: 'o1', title: 'Villa ELV',
  lines: [{ discipline: 'CCTV', description: '4MP camera', unit: 'no', quantity: 8, unitPrice: 700 }], // 5600
};

describe('PreAwardService — scope → quotation bridge (R4)', () => {
  it('creates a draft scope with a rolled-up total', async () => {
    const { svc } = harness();
    const s = await svc.createScope(scopeInput);
    expect(s.status).toBe('draft');
    expect(s.total).toBe(5600);
  });

  it('cannot generate a quotation from a scope that is not approved', async () => {
    const { svc } = harness();
    const s = await svc.createScope(scopeInput);
    await expect(svc.generateQuotation(s.id, { customerName: 'Emaar' })).rejects.toThrow('must be approved');
  });

  it('an approved scope generates a governed draft quotation from its lines', async () => {
    const { svc, quotations } = harness();
    const s = await svc.createScope(scopeInput);
    await svc.approveScope(s.id, 'u-eng');

    const quote = await svc.generateQuotation(s.id, { customerName: 'Emaar', accountId: 'a1', actorId: 'u-sales' });
    expect(quote.status).toBe('draft'); // enters the R3 governance gate like any quote
    expect(quote.sourceOpportunityId).toBe('o1');
    expect(quote.total).toBe(5880); // 5600 + 5% VAT
    expect(quote.lines[0].description).toBe('CCTV: 4MP camera');

    // the scope remembers the quote it produced, and re-generating is idempotent
    const again = await svc.generateQuotation(s.id, { customerName: 'Emaar' });
    expect(again.id).toBe(quote.id);
    expect((await quotations.list({ tenantId: 't1' })).length).toBe(1);
  });

  it('the generated quote then runs the R3 gate — approval locks a baseline', async () => {
    const { svc, quotations } = harness();
    const s = await svc.approveScope((await svc.createScope(scopeInput)).id, 'u-eng');
    const quote = await svc.generateQuotation(s.id, { customerName: 'Emaar' });
    // cannot send unapproved (R3), but approving locks the baseline
    await expect(quotations.changeStatus(quote.id, 'send')).rejects.toThrow('cannot send from status draft');
    await quotations.changeStatus(quote.id, 'approve', 'u-mgr');
    expect(await quotations.getBaseline('t1', quote.id)).not.toBeNull();
  });
});

describe('Pre-Award lifecycle (integration) — the package chain gates every quotation path', () => {
  const oppId = 'o1';
  const cScopeLines = [{ lineId: 'L1', description: '4MP camera', unit: 'no', quantity: 8, sourceLineId: 'S1' }];

  // Walk a package all the way to quotable through PreAwardPackageService.
  async function driveChainToReady(packages: PreAwardPackageService) {
    const pkg = await packages.openDirect({ tenantId: 't1', opportunityId: oppId });
    let basis = await packages.addScopeBasis({ tenantId: 't1', packageId: pkg.id, sourceId: 'sc-1', lines: cScopeLines });
    basis = await packages.approveScopeBasis(basis, 'u-eng');
    const { estimate } = await packages.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines: cScopeLines,
      buildUps: [{ basisLineId: 'L1', components: [{ costType: 'material', description: 'cam', quantity: 1, unitCost: 700 }], overheadPercent: 10, profitPercent: 15 }] });
    const fe = await packages.freezeEstimateRevision(estimate, 'u-eng');
    await packages.approveEstimateRevision(fe, 'u-mgr');
    await packages.freezePricing({ tenantId: 't1', opportunityId: oppId, policy: { method: 'markup', percent: 15 }, actorId: 'u-mgr' });
    return pkg;
  }

  it('readAggregate reflects the chain as it advances; governance is derived, not stored', async () => {
    const { packages } = governedHarness();
    expect((await packages.readAggregate('t1', oppId)).package).toBeNull(); // nothing yet

    await driveChainToReady(packages);
    const agg = await packages.readAggregate('t1', oppId);
    expect(agg.package).not.toBeNull();
    expect(agg.basis.some((b) => b.status === 'approved')).toBe(true);
    expect(agg.estimates.some((e) => e.status === 'approved')).toBe(true);
    expect(agg.pricing.some((p) => p.status === 'frozen')).toBe(true);
    expect(agg.governance).toMatchObject({ governed: true, scopeApproved: true, estimateApproved: true, pricingFrozen: true });
  });

  it('the old scope→quotation bypass is REFUSED for a governed-but-incomplete deal', async () => {
    const { svc, packages } = governedHarness();
    // A package exists (governed) but the chain is not complete.
    await packages.openDirect({ tenantId: 't1', opportunityId: oppId });
    const s = await svc.approveScope((await svc.createScope({ tenantId: 't1', opportunityId: oppId, title: 'Villa ELV', lines: [{ discipline: 'CCTV', description: '4MP camera', unit: 'no', quantity: 8, unitPrice: 700 }] })).id, 'u-eng');
    await expect(svc.generateQuotation(s.id, { customerName: 'Emaar' })).rejects.toThrow(/only a deal .* can be quoted/i);
  });

  it('once the package chain is complete, the scope→quotation path is allowed again', async () => {
    const { svc, packages } = governedHarness();
    await driveChainToReady(packages);
    const s = await svc.approveScope((await svc.createScope({ tenantId: 't1', opportunityId: oppId, title: 'Villa ELV', lines: [{ discipline: 'CCTV', description: '4MP camera', unit: 'no', quantity: 8, unitPrice: 700 }] })).id, 'u-eng');
    const quote = await svc.generateQuotation(s.id, { customerName: 'Emaar' });
    expect(quote.sourceOpportunityId).toBe(oppId);
    expect(quote.status).toBe('draft');
  });
});
