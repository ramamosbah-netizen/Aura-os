import { describe, expect, it } from 'vitest';
import { AccessService, type EventStore } from '@aura/core';
import { makeWbsNode, type WbsNode } from './domain/wbs';
import { InMemoryWbsStore } from './in-memory-wbs-store';
import { InMemoryQuantityLedgerStore } from './in-memory-quantity-ledger-store';
import { QuantityLedgerService } from './quantity-ledger.service';
import { WbsService } from './wbs.service';
import type { DeliveryItemMap } from './domain/delivery-item-map';
import type { DeliveryItemMapService } from './delivery-item-map.service';

const tenantId = 'tenant-b5';
const projectId = 'project-b5';
const frozenItemKey = 'TENDER|boq-rev-b5|BOQ-1';
const ledgerItemId = 'BOQ-1';

const access = { assert: () => undefined } as unknown as AccessService;
const events = { append: async () => [] } as unknown as EventStore;

function mapFor(node: WbsNode): DeliveryItemMap {
  return {
    id: 'map-b5', tenantId, projectId, handoverId: 'handover-b5', frozenItemKey,
    sourceKind: 'TENDER', sourceId: 'tender-b5', sourceRevisionRef: 'boq-rev-b5', sourceItemId: 'BOQ-1',
    wbsNodeId: node.id, cbsNodeId: null, createdAt: '2026-08-31T00:00:00.000Z', immutableAt: '2026-08-31T00:00:00.000Z',
  };
}

function service(store: InMemoryWbsStore, ledger: QuantityLedgerService, maps: DeliveryItemMap[] = []): WbsService {
  const mapService = { list: async () => maps } as unknown as DeliveryItemMapService;
  return new WbsService(store, events, access, ledger, undefined, undefined, mapService);
}

describe('B5 progress authority', () => {
  it('uses frozen SOLD as denominator and ignores mixed legacy BOQ rows', async () => {
    const wbsStore = new InMemoryWbsStore();
    const ledgerStore = new InMemoryQuantityLedgerStore();
    const ledger = new QuantityLedgerService(ledgerStore);
    const node = makeWbsNode({ tenantId, projectId, code: '1.1', title: 'Mapped item', plannedValue: 1000 });
    await wbsStore.create(node);
    const wbs = service(wbsStore, ledger, [mapFor(node)]);

    await ledger.post({ tenantId, projectId, boqItemId: ledgerItemId, type: 'boq', quantity: 120, unit: 'nr', source: 'boq_baseline' });
    await ledger.post({ tenantId, projectId, boqItemId: ledgerItemId, type: 'boq', quantity: 100, unit: 'nr', source: 'boq_baseline', semantic: 'sold', dedupeKey: 'sold:project-b5:handover-b5:TENDER|boq-rev-b5|BOQ-1' });
    await ledger.post({ tenantId, projectId, boqItemId: ledgerItemId, type: 'installed', quantity: 40, unit: 'nr', source: 'installation', dedupeKey: 'installed:1' });

    await wbs.syncProgressFromQuantity(tenantId, ledgerItemId, projectId);
    expect((await wbs.get(node.id))?.progress).toBe(40);
    expect((await wbs.get(node.id))?.earnedValue).toBe(400);
  });

  it('fails closed when SOLD is unavailable instead of writing 0%', async () => {
    const wbsStore = new InMemoryWbsStore();
    const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore());
    const node = makeWbsNode({ tenantId, projectId, code: '1.1', title: 'Unknown target' });
    await wbsStore.create({ ...node, progress: 25, earnedValue: 0 });
    const wbs = service(wbsStore, ledger, [mapFor(node)]);

    await ledger.post({ tenantId, projectId, boqItemId: ledgerItemId, type: 'installed', quantity: 10, unit: 'nr', source: 'installation', dedupeKey: 'installed:unknown' });
    expect(await wbs.syncProgressFromQuantity(tenantId, ledgerItemId, projectId)).toEqual([]);
    expect((await wbs.get(node.id))?.progress).toBe(25);
  });

  it('rejects manual progress for mapped WBS and derived parents, but allows an unmapped leaf', async () => {
    const wbsStore = new InMemoryWbsStore();
    const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore());
    const mapped = makeWbsNode({ tenantId, projectId, code: '1.1', title: 'Mapped' });
    const parent = makeWbsNode({ tenantId, projectId, code: '1', title: 'Parent' });
    const child = makeWbsNode({ tenantId, projectId, parentId: parent.id, code: '1.2', title: 'Child' });
    const unmapped = makeWbsNode({ tenantId, projectId, code: '2.1', title: 'Manual leaf' });
    await Promise.all([wbsStore.create(mapped), wbsStore.create(parent), wbsStore.create(child), wbsStore.create(unmapped)]);
    const wbs = service(wbsStore, ledger, [mapFor(mapped)]);

    await expect(wbs.updateProgress(mapped.id, 20)).rejects.toThrow(/quantity-controlled/);
    await expect(wbs.updateProgress(parent.id, 20)).rejects.toThrow(/derived parent/);
    await expect(wbs.updateProgress(unmapped.id, 20)).resolves.toMatchObject({ progress: 20 });
  });

  it('replays installation without duplicating physical progress and ignores certified/billed facts', async () => {
    const wbsStore = new InMemoryWbsStore();
    const ledgerStore = new InMemoryQuantityLedgerStore();
    const ledger = new QuantityLedgerService(ledgerStore);
    const node = makeWbsNode({ tenantId, projectId, code: '1.1', title: 'Mapped item' });
    await wbsStore.create(node);
    const wbs = service(wbsStore, ledger, [mapFor(node)]);

    await ledger.post({ tenantId, projectId, boqItemId: ledgerItemId, type: 'boq', quantity: 100, unit: 'nr', source: 'boq_baseline', semantic: 'sold', dedupeKey: 'sold:replay' });
    await ledger.post({ tenantId, projectId, boqItemId: ledgerItemId, type: 'installed', quantity: 40, unit: 'nr', source: 'installation', dedupeKey: 'installed:replay' });
    await ledger.post({ tenantId, projectId, boqItemId: ledgerItemId, type: 'installed', quantity: 40, unit: 'nr', source: 'installation', dedupeKey: 'installed:replay' });
    await ledger.post({ tenantId, projectId, boqItemId: ledgerItemId, type: 'invoiced', quantity: 10, unit: 'nr', source: 'ipc', semantic: 'certified', dedupeKey: 'certified:replay' });
    await ledger.post({ tenantId, projectId, boqItemId: ledgerItemId, type: 'invoiced', quantity: 10, unit: 'nr', source: 'customer_invoice', semantic: 'billed', dedupeKey: 'billed:replay' });

    await wbs.syncProgressFromQuantity(tenantId, ledgerItemId, projectId);
    await wbs.syncProgressFromQuantity(tenantId, ledgerItemId, projectId);
    expect((await ledger.list({ tenantId, projectId, boqItemId: ledgerItemId })).filter((x) => x.type === 'installed')).toHaveLength(1);
    expect((await wbs.get(node.id))?.progress).toBe(40);
  });

  it('scopes quantity progress to the originating project when BOQ ids are reused', async () => {
    const wbsStore = new InMemoryWbsStore();
    const ledgerStore = new InMemoryQuantityLedgerStore();
    const ledger = new QuantityLedgerService(ledgerStore);
    const projectA = 'project-b5-a';
    const projectB = 'project-b5-b';
    const sharedBoqId = 'BOQ-SHARED';
    const nodeA = makeWbsNode({ tenantId, projectId: projectA, code: '1.1', title: 'A', plannedValue: 100 });
    const nodeB = makeWbsNode({ tenantId, projectId: projectB, code: '1.1', title: 'B', plannedValue: 100 });
    await Promise.all([wbsStore.create(nodeA), wbsStore.create(nodeB)]);
    const maps: DeliveryItemMap[] = [
      { ...mapFor(nodeA), projectId: projectA, frozenItemKey: 'TENDER|a|BOQ-SHARED', sourceRevisionRef: 'a', sourceId: 'tender-a', sourceItemId: sharedBoqId },
      { ...mapFor(nodeB), id: 'map-b5-b', projectId: projectB, frozenItemKey: 'TENDER|b|BOQ-SHARED', sourceRevisionRef: 'b', sourceId: 'tender-b', sourceItemId: sharedBoqId, wbsNodeId: nodeB.id },
    ];
    const scoped = service(wbsStore, ledger, maps);

    await ledger.post({ tenantId, projectId: projectA, boqItemId: sharedBoqId, type: 'boq', quantity: 100, unit: 'nr', source: 'boq_baseline', semantic: 'sold', dedupeKey: 'sold:a' });
    await ledger.post({ tenantId, projectId: projectA, boqItemId: sharedBoqId, type: 'installed', quantity: 40, unit: 'nr', source: 'installation', dedupeKey: 'installed:a' });
    await scoped.syncProgressFromQuantity(tenantId, sharedBoqId, projectA);

    expect((await scoped.get(nodeA.id))?.progress).toBe(40);
    expect((await scoped.get(nodeB.id))?.progress).toBe(0);
  });
});
