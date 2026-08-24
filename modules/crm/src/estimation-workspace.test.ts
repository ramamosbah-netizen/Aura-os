import { describe, it, expect } from 'vitest';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';
import { PreAwardPackageService } from './pre-award-package.service';

// Slice 6B — the Estimation Workspace backend contract (no UI here).
//   Estimation answers "what will it cost us?" with STRUCTURED resources; the engine computes, the
//   caller never sends a total; and a draft edits freely while frozen/approved is immutable.

function harness() {
  const store = new InMemoryPreAwardPackageStore();
  const service = new PreAwardPackageService(store, new InMemoryPricingSheetStore());
  return { store, service };
}

async function approvedBasis(service: PreAwardPackageService, oppId: string) {
  const pkg = await service.openDirect({ tenantId: 't1', opportunityId: oppId });
  const basis = await service.addScopeBasis({
    tenantId: 't1', packageId: pkg.id, sourceId: 's',
    lines: [
      { lineId: 'S-CCTV', description: 'CCTV', unit: 'no', quantity: 12, sourceLineId: 'REQ-CCTV' },
      { lineId: 'S-CABLE', description: 'CAT6', unit: 'm', quantity: 480, sourceLineId: 'REQ-CABLE' },
    ],
  });
  await service.approveScopeBasisById('t1', pkg.id, basis.id, 'm1');
  return { pkg, basis };
}

describe('Open Estimation seeds a cost-only revision from the approved scope', () => {
  it('creates one build-up per basis line, at zero cost, keeping the basis line ids', async () => {
    const { service } = harness();
    const { pkg, basis } = await approvedBasis(service, 'o1');
    const { estimate, buildUps } = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines, buildUps: [] });
    expect(buildUps.map((b) => b.basisLineId).sort()).toEqual(['S-CABLE', 'S-CCTV']);
    expect(estimate.totals.estimatedCost).toBe(0);
    expect('totalSellingValue' in estimate.totals).toBe(false); // boundary: no selling number
    expect(buildUps.every((b) => b.profitPercent === 0 && b.profitAmount === 0)).toBe(true);
  });
});

describe('the engine costs a structured resource breakdown — the caller never sends a total', () => {
  it('materials + labour + plant compile to a derived directCost and estimatedCost', async () => {
    const { service } = harness();
    const { pkg, basis } = await approvedBasis(service, 'o1');
    const opened = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines, buildUps: [] });

    const { estimate, buildUps } = await service.updateEstimateBuildUps({
      tenantId: 't1', packageId: pkg.id, estimateId: opened.estimate.id,
      buildUps: [
        // CCTV qty 12: material 800/unit; technician 24h@55 (line total); transport 300 (line total).
        { basisLineId: 'S-CCTV', resources: { supplyUnitPrice: 800, technician: { count: 1, hours: 24, rate: 55 }, transport: 300 }, overheadPercent: 10 },
      ], actorId: 'est',
    });
    const cctv = buildUps.find((b) => b.basisLineId === 'S-CCTV')!;
    // 800 + (24h/12=2 @55 = 110) + (300/12 = 25) = 935 direct.
    expect(cctv.directCost).toBe(935);
    expect(cctv.overheadAmount).toBe(93.5);
    expect(cctv.resources).not.toBeNull();               // the sheet is stored, not just the components
    expect(cctv.resources!.supplyUnitPrice).toBe(800);

    // estimatedCost is DERIVED: per-unit (935 + 93.5) × 12 = 12342.
    expect(estimate.totals.estimatedCost).toBe(12342);
    const derived = Math.round(buildUps.reduce((s, b) => s + (b.directCost + b.indirectAmount + b.overheadAmount + b.riskAmount) * (b.basisLineId === 'S-CCTV' ? 12 : 480), 0) * 100) / 100;
    expect(estimate.totals.estimatedCost).toBe(derived);
  });

  it('a build-up for a line that is not in the approved basis is refused', async () => {
    const { service } = harness();
    const { pkg, basis } = await approvedBasis(service, 'o1');
    const opened = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines, buildUps: [] });
    await expect(service.updateEstimateBuildUps({
      tenantId: 't1', packageId: pkg.id, estimateId: opened.estimate.id,
      buildUps: [{ basisLineId: 'S-SMUGGLED', resources: { supplyUnitPrice: 100 } }],
    })).rejects.toThrow(/not in the approved basis/i);
  });
});

describe('estimate lifecycle — draft edits freely, frozen/approved is immutable', () => {
  it('a draft edits freely; a frozen estimate refuses; a change after approval is E-002', async () => {
    const { service } = harness();
    const { pkg, basis } = await approvedBasis(service, 'o1');
    const opened = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines, buildUps: [] });

    const first = await service.updateEstimateBuildUps({ tenantId: 't1', packageId: pkg.id, estimateId: opened.estimate.id, buildUps: [{ basisLineId: 'S-CCTV', resources: { supplyUnitPrice: 800 }, overheadPercent: 10 }] });
    const second = await service.updateEstimateBuildUps({ tenantId: 't1', packageId: pkg.id, estimateId: opened.estimate.id, buildUps: [{ basisLineId: 'S-CCTV', resources: { supplyUnitPrice: 900 }, overheadPercent: 10 }] });
    expect(second.estimate.totals.estimatedCost).not.toBe(first.estimate.totals.estimatedCost); // draft edits freely

    const frozen = await service.freezeEstimateRevision(second.estimate, 'est');
    await expect(service.updateEstimateBuildUps({ tenantId: 't1', packageId: pkg.id, estimateId: frozen.id, buildUps: [{ basisLineId: 'S-CCTV', resources: { supplyUnitPrice: 999 } }] }))
      .rejects.toThrow(/only a draft estimate revision can be edited/i);

    await service.approveEstimateRevision(frozen, 'm1');
    const e2 = await service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines, buildUps: [] });
    expect(e2.estimate.revisionNo).toBe(2);
    expect(e2.buildUps.map((b) => b.basisLineId).sort()).toEqual(['S-CABLE', 'S-CCTV']); // provenance stable across revisions
  });

  it('an unknown basis quantity blocks costing (unknown is not zero)', async () => {
    const { service } = harness();
    const pkg = await service.openDirect({ tenantId: 't1', opportunityId: 'o2' });
    const basis = await service.addScopeBasis({ tenantId: 't1', packageId: pkg.id, sourceId: 's', lines: [{ lineId: 'L1', description: 'x', unit: 'no', quantity: null, sourceLineId: 'R1' }] });
    await expect(service.addEstimate({ tenantId: 't1', packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines, buildUps: [] }))
      .rejects.toThrow(/unknown quantity/i);
  });
});
