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

/**
 * BID-01 ON THE PRICING PATH: a source names a governed supplier quotation LINE — or it is the
 * legacy quote header — and never both, never neither, never a line judged non-compliant.
 */
describe('a governed estimate source', () => {
  const base = { tenantId: 't1', tenderId: 'tnd1', buildUpId: 'bu1', boqItemId: 'boq1', componentId: 'c1', supplierName: 'Gulf Security Systems', sourcedUnitCost: 395, previousUnitCost: 420 };
  const governed = {
    quotationRevisionId: 'rev-1', quotationLineId: 'ql-1', prLineId: 'prl-1', materialId: 'mat-1',
    currency: 'aed', technicalVerdict: 'compliant' as const, comparisonDate: '2026-09-24',
  };

  it('records the whole lineage, and no quote header beside it', () => {
    const s = makeEstimateSource({ ...base, governed });
    expect(s.governed).toMatchObject({ quotationLineId: 'ql-1', quotationRevisionId: 'rev-1', currency: 'AED', technicalVerdict: 'compliant' });
    expect(s.quoteId).toBeNull();
  });

  it('refuses a source claiming BOTH lineages', () => {
    expect(() => makeEstimateSource({ ...base, governed, rfqId: 'rfq-1', quoteId: 'q-1' })).toThrow(/never both/);
  });

  it('refuses a source with NEITHER', () => {
    expect(() => makeEstimateSource({ ...base })).toThrow(/rfqId and quoteId are required/);
  });

  it('refuses a governed source missing any part of its origin', () => {
    expect(() => makeEstimateSource({ ...base, governed: { ...governed, quotationRevisionId: '' } })).toThrow(/missing quotationRevisionId/);
    expect(() => makeEstimateSource({ ...base, governed: { ...governed, comparisonDate: '' } })).toThrow(/missing comparisonDate/);
  });

  it('refuses a line the technical authority judged non-compliant, whatever its price', () => {
    expect(() => makeEstimateSource({ ...base, governed: { ...governed, technicalVerdict: 'non_compliant' as unknown as 'compliant' } }))
      .toThrow(/only a technically eligible quotation line/);
  });

  it('accepts compliant-with-deviation — a deviation the Technical Manager accepted is still eligible', () => {
    expect(makeEstimateSource({ ...base, governed: { ...governed, technicalVerdict: 'compliant_with_deviation' } }).governed?.technicalVerdict)
      .toBe('compliant_with_deviation');
  });
});
