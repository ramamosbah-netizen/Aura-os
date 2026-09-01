import { describe, expect, it } from 'vitest';
import { makeProject } from './domain/project';
import { hashHandoverSnapshot, type FrozenDeliverySource } from './domain/handover';
import { makeWbsNode } from './domain/wbs';
import { makeCbsNode } from './domain/cbs';
import { InMemoryProjectStore } from './in-memory-project-store';
import { InMemoryWbsStore } from './in-memory-wbs-store';
import { InMemoryCbsStore } from './in-memory-cbs-store';
import { InMemoryDeliveryItemMapStore } from './in-memory-delivery-item-map-store';
import { DeliveryItemMapService } from './delivery-item-map.service';
import { InMemoryQuantityLedgerStore } from './in-memory-quantity-ledger-store';
import { QuantityLedgerService } from './quantity-ledger.service';

function setup(sourceKind: 'DIRECT' | 'TENDER' = 'DIRECT') {
  const tenantId = 'tenant-b3';
  const handoverId = `handover-${sourceKind.toLowerCase()}`;
  const sourceItemId = sourceKind === 'TENDER' ? 'BOQ-1' : null;
  const sourceRevisionRef = sourceKind === 'TENDER' ? 'boq-rev-1' : 'quote-rev-1';
  const frozenItemKey = sourceKind === 'TENDER' ? 'TENDER|boq-rev-1|BOQ-1' : 'DIRECT|quote-rev-1|LINE|0';
  const snapshot: FrozenDeliverySource = {
    schemaVersion: 1, handoverId, contractId: `contract-${sourceKind.toLowerCase()}`, tenantId,
    sourceKind, sourceOpportunityId: sourceKind === 'DIRECT' ? 'opp-b3' : null,
    sourceTenderId: sourceKind === 'TENDER' ? 'tender-b3' : null,
    commercialScopeRevisionId: null, boqRevisionId: sourceKind === 'TENDER' ? 'boq-rev-1' : null,
    estimateRevisionId: null, acceptedQuotationId: 'quote-b3', acceptedQuotationRevisionId: 'quote-rev-1',
    commercialBaselineId: 'baseline-b3', originalContractValue: 5000, currency: 'AED',
    awardAcceptanceType: sourceKind === 'TENDER' ? 'tender_award' : 'quotation_acceptance',
    awardAcceptanceEvidence: { sourceKind }, frozenCommercialBaseline: { id: 'baseline-b3' },
    sourceItems: [{
      frozenItemKey, sourceKind, sourceId: sourceKind === 'TENDER' ? 'tender-b3' : 'opp-b3', sourceRevisionRef,
      sourceItemId, itemCode: sourceItemId, description: 'Frozen item', unit: 'nr', soldQuantity: 10,
      customerUnitPrice: 500, customerLineValue: 5000, costEvidence: null,
      sourceSnapshot: { quantity: 10, unit: 'nr' }, unavailableReason: null,
    }], capturedAt: '2026-08-31T10:00:00.000Z',
  };
  const projects = new InMemoryProjectStore();
  const wbs = new InMemoryWbsStore();
  const cbs = new InMemoryCbsStore();
  const maps = new InMemoryDeliveryItemMapStore();
  const project = makeProject({ tenantId, title: `${sourceKind} project`, origin: 'commercial_handover', contractId: snapshot.contractId, handoverId, handoverSnapshot: snapshot, handoverSnapshotHash: hashHandoverSnapshot(snapshot), handoverLockedAt: snapshot.capturedAt });
  const wbsNode = makeWbsNode({ tenantId, projectId: project.id, code: '1', title: 'Work' });
  const cbsNode = makeCbsNode({ tenantId, projectId: project.id, code: '01', title: 'Cost' });
  return { tenantId, snapshot, projects, wbs, cbs, maps, project, wbsNode, cbsNode, mapService: new DeliveryItemMapService(maps, projects, wbs, cbs, null) };
}

async function mapping(fx: ReturnType<typeof setup>) {
  await fx.projects.create(fx.project); await fx.wbs.create(fx.wbsNode); await fx.cbs.create(fx.cbsNode);
  return fx.mapService.create({ tenantId: fx.tenantId, projectId: fx.project.id, handoverId: fx.project.handoverId!, frozenItemKey: fx.snapshot.sourceItems![0].frozenItemKey, sourceKind: fx.snapshot.sourceKind, sourceId: fx.snapshot.sourceItems![0].sourceId, sourceRevisionRef: fx.snapshot.sourceItems![0].sourceRevisionRef, sourceItemId: fx.snapshot.sourceItems![0].sourceItemId, wbsNodeId: fx.wbsNode.id, cbsNodeId: fx.cbsNode.id });
}

describe('QuantityLedgerService — contractual SOLD baseline', () => {
  it('posts Tender SOLD from the frozen item and uses the real BOQ item identity', async () => {
    const fx = setup('TENDER'); const map = await mapping(fx); const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    const txn = await ledger.postSold({ mapping: map, soldQuantity: 10, unit: 'nr' });
    expect(txn).toMatchObject({ type: 'boq', source: 'boq_baseline', quantity: 10, unit: 'nr', boqItemId: 'BOQ-1', semantic: 'sold', sourceRef: `handover:${map.handoverId}:item:${map.frozenItemKey}`, dedupeKey: `sold:${map.projectId}:${map.handoverId}:${map.frozenItemKey}` });
    expect((await ledger.position(fx.tenantId, 'BOQ-1')).sold).toBe(10);
  });

  it('posts Direct SOLD with a synthetic frozen key without claiming a Tender BOQ id', async () => {
    const fx = setup('DIRECT'); const map = await mapping(fx); const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    const txn = await ledger.postSold({ mapping: map, soldQuantity: 10, unit: 'nr' });
    expect(txn?.boqItemId).toBe('DIRECT|quote-rev-1|LINE|0');
    expect(txn?.dimensions).toMatchObject({ semantic: 'sold', frozenItemKey: map.frozenItemKey, sourceKind: 'DIRECT' });
    expect(txn?.dimensions?.sourceItemId).toBeUndefined();
  });

  it('represents missing quantity as UNKNOWN and never posts zero', async () => {
    const fx = setup(); const map = await mapping(fx); const store = new InMemoryQuantityLedgerStore(); const ledger = new QuantityLedgerService(store, fx.mapService);
    await expect(ledger.postSold({ mapping: map, soldQuantity: null, unit: 'nr' })).resolves.toBeNull();
    expect(await store.list({ tenantId: fx.tenantId })).toHaveLength(0);
  });

  it('is replay-safe and rejects a conflicting SOLD replay', async () => {
    const fx = setup(); const map = await mapping(fx); const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    const first = await ledger.postSold({ mapping: map, soldQuantity: 10, unit: 'nr' });
    const replay = await ledger.postSold({ mapping: map, soldQuantity: 10, unit: 'nr' });
    expect(replay?.id).toBe(first?.id);
    await expect(ledger.postSold({ mapping: map, soldQuantity: 12, unit: 'nr' })).rejects.toThrow('does not match frozen item evidence');
    expect((await ledger.position(fx.tenantId, map.frozenItemKey)).sold).toBe(10);
  });

  it('rejects wrong handover, tenant, unknown item and invalid mapping before posting', async () => {
    const fx = setup(); const map = await mapping(fx); const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    await expect(ledger.postSold({ mapping: { ...map, handoverId: 'other-handover' }, soldQuantity: 10, unit: 'nr' })).rejects.toThrow();
    await expect(ledger.postSold({ mapping: { ...map, projectId: 'other-project' }, soldQuantity: 10, unit: 'nr' })).rejects.toThrow();
    await expect(ledger.postSold({ mapping: { ...map, tenantId: 'tenant-other' }, soldQuantity: 10, unit: 'nr' })).rejects.toThrow();
    await expect(ledger.postSold({ mapping: { ...map, frozenItemKey: 'DIRECT|quote-rev-1|LINE|99' }, soldQuantity: 10, unit: 'nr' })).rejects.toThrow();
    await expect(ledger.postSold({ mapping: { ...map, sourceRevisionRef: 'mutable-latest' }, soldQuantity: 10, unit: 'nr' })).rejects.toThrow();
  });

  it('keeps legacy boq transactions separate from contractual SOLD', async () => {
    const fx = setup(); const map = await mapping(fx); const store = new InMemoryQuantityLedgerStore(); const ledger = new QuantityLedgerService(store, fx.mapService);
    await ledger.setBaseline({ tenantId: fx.tenantId, projectId: fx.project.id, boqItemId: map.frozenItemKey, quantity: 4, unit: 'nr' });
    await ledger.postSold({ mapping: map, soldQuantity: 10, unit: 'nr' });
    const pos = await ledger.position(fx.tenantId, map.frozenItemKey);
    expect(pos.boq).toBe(14); expect(pos.legacyBoq).toBe(4); expect(pos.sold).toBe(10);
  });

  it('does not change the B1 snapshot/hash or B2 mapping when SOLD is posted', async () => {
    const fx = setup(); const map = await mapping(fx); const beforeHash = hashHandoverSnapshot(fx.project.handoverSnapshot!); const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    await ledger.postSold({ mapping: map, soldQuantity: 10, unit: 'nr' });
    expect(hashHandoverSnapshot((await fx.projects.get(fx.project.id))!.handoverSnapshot!)).toBe(beforeHash);
    expect(await fx.maps.get(map.id)).toEqual(map);
  });
});
