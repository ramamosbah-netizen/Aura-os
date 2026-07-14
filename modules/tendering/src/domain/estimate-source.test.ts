import { describe, it, expect } from 'vitest';
import { makeRateBuildUp, withComponentUnitCost } from './estimate';
import { isSourceStale, makeEstimateSource } from './estimate-source';

const baseBuildUp = () =>
  makeRateBuildUp({
    tenantId: 't1',
    tenderId: 'tnd1',
    boqItemId: 'boq1',
    components: [
      { costType: 'material', description: 'Cable', quantity: 1, unitCost: 100 },
      { costType: 'labour', description: 'Install', quantity: 2, unitCost: 50 },
    ],
    overheadPercent: 10,
    profitPercent: 5,
  });

describe('withComponentUnitCost (bid-time sourcing recompute)', () => {
  it('assigns each component a stable id', () => {
    const b = baseBuildUp();
    expect(b.components.every((c) => typeof c.id === 'string' && c.id.length > 0)).toBe(true);
  });

  it('sets the sourced unit cost and re-derives amount, direct cost and selling rate', () => {
    const b = baseBuildUp();
    // baseline: direct 200, overhead 20, profit (220)*5% = 11, selling 231
    expect(b.directCost).toBe(200);
    expect(b.sellingRate).toBe(231);

    const materialId = b.components[0].id!;
    const sourced = withComponentUnitCost(b, materialId, 150);

    expect(sourced.components[0].unitCost).toBe(150);
    expect(sourced.components[0].amount).toBe(150); // qty 1 × 150
    expect(sourced.components[1].amount).toBe(100); // untouched
    expect(sourced.directCost).toBe(250);
    expect(sourced.overheadAmount).toBe(25);
    expect(sourced.profitAmount).toBe(13.75); // (250 + 25) × 5%
    expect(sourced.sellingRate).toBe(288.75);
    // original build-up is not mutated (pure)
    expect(b.sellingRate).toBe(231);
  });

  it('throws when the component id is not in the build-up (rebuilt since sourcing)', () => {
    expect(() => withComponentUnitCost(baseBuildUp(), 'no-such-component', 10)).toThrow(/not found/);
  });

  it('rejects a negative sourced unit cost', () => {
    const b = baseBuildUp();
    expect(() => withComponentUnitCost(b, b.components[0].id!, -1)).toThrow(/negative/);
  });
});

describe('estimate-source domain', () => {
  it('stamps provenance and defaults', () => {
    const s = makeEstimateSource({
      tenantId: 't1',
      tenderId: 'tnd1',
      buildUpId: 'b1',
      boqItemId: 'boq1',
      componentId: 'c1',
      rfqId: 'rfq1',
      quoteId: 'q1',
      supplierName: 'Gulf Cables',
      sourcedUnitCost: 120,
      previousUnitCost: 100,
    });
    expect(s.sourcedUnitCost).toBe(120);
    expect(s.previousUnitCost).toBe(100);
    expect(s.supplierName).toBe('Gulf Cables');
    expect(typeof s.sourcedAt).toBe('string');
  });

  it('isSourceStale: true when the live quote drifted or vanished', () => {
    const s = { sourcedUnitCost: 120 };
    expect(isSourceStale(s, 120)).toBe(false);
    expect(isSourceStale(s, 130)).toBe(true);
    expect(isSourceStale(s, null)).toBe(true);
  });
});
