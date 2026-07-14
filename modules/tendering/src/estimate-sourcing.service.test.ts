import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEstimateStore } from './in-memory-estimate-store';
import { InMemoryEstimateSourceStore } from './in-memory-estimate-source-store';
import { EstimateSourcingService } from './estimate-sourcing.service';
import { makeRateBuildUp, type RateBuildUp } from './domain/estimate';

// Minimal EVENT_STORE stand-in — records appended event types.
function fakeEvents() {
  const types: string[] = [];
  return { store: { append: async (evts: Array<{ type: string }>) => void evts.forEach((e) => types.push(e.type)) } as any, types };
}

const TENANT = 't1';

async function setup() {
  const estimates = new InMemoryEstimateStore();
  const sources = new InMemoryEstimateSourceStore();
  const { store: events, types } = fakeEvents();
  const svc = new EstimateSourcingService(estimates, sources, events);

  const buildUp = makeRateBuildUp({
    tenantId: TENANT,
    tenderId: 'tnd1',
    boqItemId: 'boq1',
    components: [
      { costType: 'material', description: 'Cable', quantity: 1, unitCost: 100 },
      { costType: 'labour', description: 'Install', quantity: 2, unitCost: 50 },
    ],
    overheadPercent: 10,
    profitPercent: 5,
  });
  await estimates.save(buildUp);
  return { estimates, sources, svc, types, buildUp };
}

describe('EstimateSourcingService', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('sourcing a component updates the rate and records the link (DoD)', async () => {
    const materialId = ctx.buildUp.components[0].id!;
    const { buildUp } = await ctx.svc.source({
      tenantId: TENANT,
      buildUpId: ctx.buildUp.id,
      componentId: materialId,
      rfqId: 'rfq1',
      quoteId: 'q1',
      supplierName: 'Gulf Cables',
      quoteAmount: 150,
    });
    // 100 → 150 lifts direct 200 → 250 and selling 231 → 288.75
    expect(buildUp.sellingRate).toBe(288.75);
    // persisted
    const saved = await ctx.estimates.get(ctx.buildUp.id);
    expect(saved?.sellingRate).toBe(288.75);
    // link recorded with the pre-source rate for un-sourcing
    const link = await ctx.sources.getByComponent(TENANT, ctx.buildUp.id, materialId);
    expect(link).toMatchObject({ quoteId: 'q1', sourcedUnitCost: 150, previousUnitCost: 100 });
    expect(ctx.types).toContain('tendering.estimate.component_sourced');
  });

  it('changing the quote restamps: award reactor reprices linked components (DoD)', async () => {
    const materialId = ctx.buildUp.components[0].id!;
    await ctx.svc.source({
      tenantId: TENANT, buildUpId: ctx.buildUp.id, componentId: materialId,
      rfqId: 'rfq1', quoteId: 'q1', supplierName: 'Gulf Cables', quoteAmount: 150,
    });

    // The RFQ is awarded to a different quote at a lower price → restamp to 120.
    const n = await ctx.svc.restampFromAward({ tenantId: TENANT, rfqId: 'rfq1', quoteId: 'q2', supplierName: 'Emirates Cables', amount: 120 });
    expect(n).toBe(1);

    const saved = await ctx.estimates.get(ctx.buildUp.id);
    expect(saved?.components[0].unitCost).toBe(120);
    expect(saved?.directCost).toBe(220); // 120 + 100
    const link = await ctx.sources.getByComponent(TENANT, ctx.buildUp.id, materialId);
    expect(link).toMatchObject({ quoteId: 'q2', supplierName: 'Emirates Cables', sourcedUnitCost: 120 });
    expect(ctx.types).toContain('tendering.estimate.source_restamped');
  });

  it('award with no sourced components is a no-op', async () => {
    const n = await ctx.svc.restampFromAward({ tenantId: TENANT, rfqId: 'rfq-unrelated', quoteId: 'q9', supplierName: 'X', amount: 99 });
    expect(n).toBe(0);
  });

  it('un-sourcing reverts the component to its pre-source rate and drops the link', async () => {
    const materialId = ctx.buildUp.components[0].id!;
    await ctx.svc.source({
      tenantId: TENANT, buildUpId: ctx.buildUp.id, componentId: materialId,
      rfqId: 'rfq1', quoteId: 'q1', supplierName: 'Gulf Cables', quoteAmount: 150,
    });
    await ctx.svc.unsource(TENANT, ctx.buildUp.id, materialId);

    const saved = await ctx.estimates.get(ctx.buildUp.id);
    expect(saved?.components[0].unitCost).toBe(100); // back to original
    expect(saved?.sellingRate).toBe(231);
    expect(await ctx.sources.getByComponent(TENANT, ctx.buildUp.id, materialId)).toBeNull();
  });

  it('restamp drops an orphaned link when the build-up was rebuilt (component id gone)', async () => {
    const materialId = ctx.buildUp.components[0].id!;
    await ctx.svc.source({
      tenantId: TENANT, buildUpId: ctx.buildUp.id, componentId: materialId,
      rfqId: 'rfq1', quoteId: 'q1', supplierName: 'Gulf Cables', quoteAmount: 150,
    });
    // simulate a rebuild: replace the build-up's components with fresh ids
    const rebuilt: RateBuildUp = { ...ctx.buildUp, components: ctx.buildUp.components.map((c) => ({ ...c, id: `new-${c.id}` })) };
    await ctx.estimates.save(rebuilt);

    const n = await ctx.svc.restampFromAward({ tenantId: TENANT, rfqId: 'rfq1', quoteId: 'q1', supplierName: 'Gulf Cables', amount: 120 });
    expect(n).toBe(0); // nothing restamped
    expect(await ctx.sources.getByComponent(TENANT, ctx.buildUp.id, materialId)).toBeNull(); // orphan dropped
  });
});
