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
  const tenantId = 'tenant-c2';
  const contractId = `contract-${sourceKind.toLowerCase()}`;
  const sourceItemId = sourceKind === 'TENDER' ? 'BOQ-C2-1' : null;
  const sourceRevisionRef = sourceKind === 'TENDER' ? 'boq-rev-c2' : 'quote-rev-c2';
  const frozenItemKey = sourceKind === 'TENDER' ? 'TENDER|boq-rev-c2|BOQ-C2-1' : 'DIRECT|quote-rev-c2|LINE|0';
  const snapshot: FrozenDeliverySource = {
    schemaVersion: 1,
    handoverId: `handover-${sourceKind.toLowerCase()}`,
    contractId,
    tenantId,
    sourceKind,
    sourceOpportunityId: sourceKind === 'DIRECT' ? 'opp-c2' : null,
    sourceTenderId: sourceKind === 'TENDER' ? 'tender-c2' : null,
    commercialScopeRevisionId: null,
    boqRevisionId: sourceKind === 'TENDER' ? 'boq-rev-c2' : null,
    estimateRevisionId: null,
    acceptedQuotationId: 'quote-c2',
    acceptedQuotationRevisionId: 'quote-rev-c2',
    commercialBaselineId: 'baseline-c2',
    originalContractValue: 1000,
    currency: 'AED',
    awardAcceptanceType: sourceKind === 'TENDER' ? 'tender_award' : 'quotation_acceptance',
    awardAcceptanceEvidence: { sourceKind },
    frozenCommercialBaseline: { id: 'baseline-c2' },
    sourceItems: [{
      frozenItemKey,
      sourceKind,
      sourceId: sourceKind === 'TENDER' ? 'tender-c2' : 'opp-c2',
      sourceRevisionRef,
      sourceItemId,
      itemCode: sourceItemId,
      description: 'Frozen execution item',
      unit: 'nr',
      soldQuantity: 10,
      customerUnitPrice: 100,
      customerLineValue: 1000,
      costEvidence: null,
      sourceSnapshot: { quantity: 10, unit: 'nr' },
      unavailableReason: null,
    }],
    capturedAt: '2026-09-01T10:00:00.000Z',
  };
  const projects = new InMemoryProjectStore();
  const wbs = new InMemoryWbsStore();
  const cbs = new InMemoryCbsStore();
  const maps = new InMemoryDeliveryItemMapStore();
  const project = makeProject({
    tenantId,
    title: `${sourceKind} C2 project`,
    origin: 'commercial_handover',
    contractId,
    handoverId: snapshot.handoverId,
    handoverSnapshot: snapshot,
    handoverSnapshotHash: hashHandoverSnapshot(snapshot),
    handoverLockedAt: snapshot.capturedAt,
  });
  const wbsNode = makeWbsNode({ tenantId, projectId: project.id, code: '1', title: 'Execution' });
  const cbsNode = makeCbsNode({ tenantId, projectId: project.id, code: '01', title: 'Execution cost' });
  const mapService = new DeliveryItemMapService(maps, projects, wbs, cbs, null);
  return { tenantId, snapshot, projects, wbs, cbs, maps, project, wbsNode, cbsNode, mapService };
}

async function mapped(fx: ReturnType<typeof setup>) {
  await fx.projects.create(fx.project);
  await fx.wbs.create(fx.wbsNode);
  await fx.cbs.create(fx.cbsNode);
  const item = fx.snapshot.sourceItems![0];
  return fx.mapService.create({
    tenantId: fx.tenantId,
    projectId: fx.project.id,
    handoverId: fx.project.handoverId!,
    frozenItemKey: item.frozenItemKey,
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    sourceRevisionRef: item.sourceRevisionRef,
    sourceItemId: item.sourceItemId,
    wbsNodeId: fx.wbsNode.id,
    cbsNodeId: fx.cbsNode.id,
  });
}

describe('QuantityLedgerService — governed execution quantity', () => {
  it.each(['TENDER', 'DIRECT'] as const)('posts %s installed quantity from its frozen map', async (sourceKind) => {
    const fx = setup(sourceKind);
    const map = await mapped(fx);
    const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    const txn = await ledger.postInstalled({
      tenantId: fx.tenantId,
      projectId: fx.project.id,
      installationId: `installation-${sourceKind}`,
      boqItemId: map.sourceItemId ?? map.frozenItemKey,
      cbsNodeId: map.cbsNodeId,
      quantity: 4,
      unit: 'nr',
      occurredAt: '2026-09-01T11:00:00.000Z',
    });
    expect(txn).toMatchObject({
      type: 'installed',
      source: 'installation',
      sourceRef: `installation:installation-${sourceKind}`,
      dedupeKey: `installed:installation-${sourceKind}`,
      boqItemId: map.sourceItemId ?? map.frozenItemKey,
      cbsNodeId: map.cbsNodeId,
      quantity: 4,
      unit: 'nr',
    });
    expect(txn?.dimensions).toMatchObject({ frozenItemKey: map.frozenItemKey, executionSemantic: 'executed' });
  });

  it('is idempotent and rejects a conflicting replay', async () => {
    const fx = setup();
    const map = await mapped(fx);
    const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    const input = { tenantId: fx.tenantId, projectId: fx.project.id, installationId: 'installation-replay', boqItemId: map.frozenItemKey, quantity: 4, unit: 'nr' };
    const first = await ledger.postInstalled(input);
    const replay = await ledger.postInstalled(input);
    expect(replay?.id).toBe(first?.id);
    await expect(ledger.postInstalled({ ...input, quantity: 5 })).rejects.toThrow('conflicting installed replay');
    expect((await ledger.list({ tenantId: fx.tenantId, projectId: fx.project.id })).filter((row) => row.type === 'installed')).toHaveLength(1);
  });

  it('keeps unavailable execution evidence as UNKNOWN and never posts zero', async () => {
    const fx = setup();
    await mapped(fx);
    const store = new InMemoryQuantityLedgerStore();
    const ledger = new QuantityLedgerService(store, fx.mapService);
    await expect(ledger.postInstalled({ tenantId: fx.tenantId, projectId: fx.project.id, installationId: 'missing-qty', boqItemId: fx.snapshot.sourceItems![0].frozenItemKey, quantity: null, unit: 'nr' })).resolves.toBeNull();
    await expect(ledger.postInstalled({ tenantId: fx.tenantId, projectId: fx.project.id, installationId: 'zero-qty', boqItemId: fx.snapshot.sourceItems![0].frozenItemKey, quantity: 0, unit: 'nr' })).resolves.toBeNull();
    await expect(ledger.postInstalled({ tenantId: fx.tenantId, projectId: fx.project.id, installationId: 'missing-unit', boqItemId: fx.snapshot.sourceItems![0].frozenItemKey, quantity: 1 })).rejects.toThrow('unit evidence is unavailable');
    expect(await store.list({ tenantId: fx.tenantId })).toHaveLength(0);
  });

  it('fails closed for wrong tenant, project, handover item and delivery node', async () => {
    const fx = setup();
    const map = await mapped(fx);
    const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    const base = { tenantId: fx.tenantId, projectId: fx.project.id, installationId: 'installation-invalid', boqItemId: map.frozenItemKey, quantity: 1, unit: 'nr' };
    await expect(ledger.postInstalled({ ...base, tenantId: 'other-tenant' })).rejects.toThrow();
    await expect(ledger.postInstalled({ ...base, projectId: 'other-project' })).rejects.toThrow();
    await expect(ledger.postInstalled({ ...base, boqItemId: 'unknown-frozen-item' })).rejects.toThrow();
    await expect(ledger.postInstalled({ ...base, cbsNodeId: 'other-cbs' })).rejects.toThrow();
  });

  it('does not mutate the B1 snapshot or B2 mapping', async () => {
    const fx = setup();
    const map = await mapped(fx);
    const beforeHash = hashHandoverSnapshot(fx.project.handoverSnapshot!);
    const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    await ledger.postInstalled({ tenantId: fx.tenantId, projectId: fx.project.id, installationId: 'installation-stable', boqItemId: map.frozenItemKey, quantity: 2, unit: 'nr' });
    expect(hashHandoverSnapshot((await fx.projects.get(fx.project.id))!.handoverSnapshot!)).toBe(beforeHash);
    expect(await fx.maps.get(map.id)).toEqual(map);
  });
});
