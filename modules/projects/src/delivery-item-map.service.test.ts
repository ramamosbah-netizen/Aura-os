import { describe, expect, it, vi } from 'vitest';
import { makeProject } from './domain/project';
import { hashHandoverSnapshot, type FrozenDeliverySource } from './domain/handover';
import { makeWbsNode } from './domain/wbs';
import { makeCbsNode } from './domain/cbs';
import { InMemoryProjectStore } from './in-memory-project-store';
import { InMemoryWbsStore } from './in-memory-wbs-store';
import { InMemoryCbsStore } from './in-memory-cbs-store';
import { InMemoryDeliveryItemMapStore } from './in-memory-delivery-item-map-store';
import { DeliveryItemMapService } from './delivery-item-map.service';

const tenantId = 'tenant-b2';

function sourceSnapshot(): FrozenDeliverySource {
  return {
    schemaVersion: 1,
    handoverId: 'handover-b2',
    contractId: 'contract-b2',
    tenantId,
    sourceKind: 'DIRECT',
    sourceOpportunityId: 'opp-b2',
    sourceTenderId: null,
    commercialScopeRevisionId: null,
    boqRevisionId: null,
    estimateRevisionId: 'estimate-b2',
    acceptedQuotationId: 'quote-b2',
    acceptedQuotationRevisionId: 'quote-revision-b2',
    commercialBaselineId: 'baseline-b2',
    originalContractValue: 1200,
    currency: 'AED',
    awardAcceptanceType: 'quotation_acceptance',
    awardAcceptanceEvidence: { acceptedAt: '2026-08-31T09:00:00.000Z' },
    frozenCommercialBaseline: { id: 'baseline-b2', total: 1200 },
    sourceItems: [
      {
        frozenItemKey: 'DIRECT|quote-revision-b2|LINE|0',
        sourceKind: 'DIRECT',
        sourceId: 'opp-b2',
        sourceRevisionRef: 'quote-revision-b2',
        sourceItemId: null,
        itemCode: null,
        description: 'Camera installation',
        unit: 'nr',
        soldQuantity: 12,
        customerUnitPrice: 100,
        customerLineValue: 1200,
        costEvidence: null,
        sourceSnapshot: { description: 'Camera installation', quantity: 12 },
        unavailableReason: null,
      },
    ],
    capturedAt: '2026-08-31T09:00:00.000Z',
  };
}

async function fixture() {
  const projects = new InMemoryProjectStore();
  const wbs = new InMemoryWbsStore();
  const cbs = new InMemoryCbsStore();
  const maps = new InMemoryDeliveryItemMapStore();
  const snapshot = sourceSnapshot();
  const project = makeProject({
    tenantId,
    title: 'B2 Mapping Project',
    value: 1200,
    origin: 'commercial_handover',
    contractId: snapshot.contractId,
    handoverId: snapshot.handoverId,
    handoverSnapshot: snapshot,
    handoverSnapshotHash: hashHandoverSnapshot(snapshot),
    handoverLockedAt: snapshot.capturedAt,
  });
  await projects.create(project);
  const wbsNode = makeWbsNode({ tenantId, projectId: project.id, code: '1.1', title: 'Cameras', boqItemId: null });
  const cbsNode = makeCbsNode({ tenantId, projectId: project.id, code: '01.01', title: 'Direct cost' });
  await wbs.create(wbsNode);
  await cbs.create(cbsNode);
  const service = new DeliveryItemMapService(maps, projects, wbs, cbs, null);
  return { projects, wbs, cbs, maps, service, project, wbsNode, cbsNode, snapshot };
}

function input(fx: Awaited<ReturnType<typeof fixture>>) {
  return {
    tenantId,
    projectId: fx.project.id,
    handoverId: fx.project.handoverId!,
    frozenItemKey: fx.snapshot.sourceItems![0].frozenItemKey,
    sourceKind: 'DIRECT' as const,
    sourceId: 'opp-b2',
    sourceRevisionRef: 'quote-revision-b2',
    sourceItemId: null,
    wbsNodeId: fx.wbsNode.id,
    cbsNodeId: fx.cbsNode.id,
  };
}

describe('DeliveryItemMapService — immutable frozen item lineage', () => {
  it('accepts a valid Direct frozen-item mapping', async () => {
    const fx = await fixture();
    const map = await fx.service.create(input(fx));
    expect(map).toMatchObject({ projectId: fx.project.id, handoverId: fx.project.handoverId, frozenItemKey: 'DIRECT|quote-revision-b2|LINE|0' });
  });

  it('accepts a valid Tender frozen-item mapping without consulting Tender state', async () => {
    const fx = await fixture();
    const tenderSnapshot = { ...fx.snapshot, sourceKind: 'TENDER' as const, sourceTenderId: 'tender-b2', sourceOpportunityId: null, sourceItems: [{ ...fx.snapshot.sourceItems![0], frozenItemKey: 'TENDER|boq-revision-b2|BOQ-1', sourceKind: 'TENDER' as const, sourceId: 'tender-b2', sourceRevisionRef: 'boq-revision-b2', sourceItemId: 'BOQ-1' }] };
    const tenderProject = makeProject({ tenantId, title: 'Tender B2', value: 1200, origin: 'commercial_handover', contractId: tenderSnapshot.contractId, handoverId: tenderSnapshot.handoverId, handoverSnapshot: tenderSnapshot, handoverSnapshotHash: hashHandoverSnapshot(tenderSnapshot), handoverLockedAt: tenderSnapshot.capturedAt });
    await fx.projects.create(tenderProject);
    const tenderWbs = makeWbsNode({ tenantId, projectId: tenderProject.id, code: '1.1', title: 'Tender item' });
    const tenderCbs = makeCbsNode({ tenantId, projectId: tenderProject.id, code: '01.01', title: 'Tender cost' });
    await fx.wbs.create(tenderWbs); await fx.cbs.create(tenderCbs);
    const map = await fx.service.create({ tenantId, projectId: tenderProject.id, handoverId: tenderProject.handoverId!, frozenItemKey: 'TENDER|boq-revision-b2|BOQ-1', sourceKind: 'TENDER', sourceId: 'tender-b2', sourceRevisionRef: 'boq-revision-b2', sourceItemId: 'BOQ-1', wbsNodeId: tenderWbs.id, cbsNodeId: tenderCbs.id });
    expect(map.sourceKind).toBe('TENDER');
  });

  it('is idempotent for the same mapping and rejects a conflicting remap', async () => {
    const fx = await fixture();
    const first = await fx.service.create(input(fx));
    const replay = await fx.service.create(input(fx));
    expect(replay.id).toBe(first.id);
    expect(await fx.maps.list()).toHaveLength(1);
    await expect(fx.service.create({ ...input(fx), cbsNodeId: null })).rejects.toThrow('conflicting immutable delivery item mapping');
  });

  it('emits one mapping event and audit row for the insert winner, not for replay', async () => {
    const fx = await fixture();
    const events = { append: vi.fn().mockResolvedValue(undefined) };
    const audit = { log: vi.fn().mockResolvedValue(undefined) };
    const service = new DeliveryItemMapService(fx.maps, fx.projects, fx.wbs, fx.cbs, null, events as never, audit as never);

    const first = await service.create(input(fx));
    const replay = await service.create(input(fx));

    expect(replay.id).toBe(first.id);
    expect(events.append).toHaveBeenCalledTimes(1);
    expect(events.append.mock.calls[0][0][0]).toMatchObject({
      type: 'projects.delivery_item_map.created',
      aggregateId: first.id,
      payload: { handoverId: first.handoverId, frozenItemKey: first.frozenItemKey },
    });
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported source kind before persistence', async () => {
    const fx = await fixture();
    await expect(fx.service.create({ ...input(fx), sourceKind: 'LEGACY' as never })).rejects.toThrow('source kind must be DIRECT or TENDER');
    expect(await fx.maps.list()).toHaveLength(0);
  });

  it.each([
    ['unknown frozen item', (fx: Awaited<ReturnType<typeof fixture>>) => ({ ...input(fx), frozenItemKey: 'DIRECT|quote-revision-b2|LINE|99' })],
    ['wrong handover', (fx: Awaited<ReturnType<typeof fixture>>) => ({ ...input(fx), handoverId: 'other-handover' })],
    ['wrong tenant', (fx: Awaited<ReturnType<typeof fixture>>) => ({ ...input(fx), tenantId: 'tenant-other' })],
    ['WBS from another project', async (fx: Awaited<ReturnType<typeof fixture>>) => { const other = makeWbsNode({ tenantId, projectId: 'other-project', code: '9', title: 'Other' }); await fx.wbs.create(other); return { ...input(fx), wbsNodeId: other.id }; }],
    ['CBS from another project', async (fx: Awaited<ReturnType<typeof fixture>>) => { const other = makeCbsNode({ tenantId, projectId: 'other-project', code: '09', title: 'Other' }); await fx.cbs.create(other); return { ...input(fx), cbsNodeId: other.id }; }],
    ['source identity mismatch', (fx: Awaited<ReturnType<typeof fixture>>) => ({ ...input(fx), sourceRevisionRef: 'mutable-latest' })],
  ])('%s is rejected', async (_label, makeInput) => {
    const fx = await fixture();
    const candidate = await makeInput(fx);
    await expect(fx.service.create(candidate)).rejects.toThrow();
    expect(await fx.maps.list()).toHaveLength(0);
  });

  it('rejects an existing project when the supplied handover belongs to another project', async () => {
    const fx = await fixture();
    const otherSnapshot = { ...fx.snapshot, handoverId: 'handover-other', contractId: 'contract-other' };
    const other = makeProject({ tenantId, title: 'Other project', origin: 'commercial_handover', contractId: otherSnapshot.contractId, handoverId: otherSnapshot.handoverId, handoverSnapshot: otherSnapshot, handoverSnapshotHash: hashHandoverSnapshot(otherSnapshot), handoverLockedAt: otherSnapshot.capturedAt });
    await fx.projects.create(other);
    await expect(fx.service.create({ ...input(fx), projectId: other.id })).rejects.toThrow('does not match project');
    expect(await fx.maps.list()).toHaveLength(0);
  });

  it('rejects a project/handover mismatch and preserves the B1 snapshot hash', async () => {
    const fx = await fixture();
    const beforeHash = hashHandoverSnapshot(fx.project.handoverSnapshot!);
    await expect(fx.service.create({ ...input(fx), projectId: 'other-project' })).rejects.toThrow('project other-project not found');
    const reloaded = await fx.projects.get(fx.project.id);
    expect(hashHandoverSnapshot(reloaded!.handoverSnapshot!)).toBe(beforeHash);
    expect(reloaded!.handoverSnapshot).toEqual(fx.snapshot);
  });

  it('fails closed when the persisted B1 snapshot hash no longer matches', async () => {
    const fx = await fixture();
    const corrupted = {
      ...(await fx.projects.get(fx.project.id))!,
      handoverSnapshot: { ...fx.snapshot, originalContractValue: 9999 },
    };
    await fx.projects.update(corrupted);
    await expect(fx.service.create(input(fx))).rejects.toThrow('snapshot hash is invalid');
    expect(await fx.maps.list()).toHaveLength(0);
  });
});
