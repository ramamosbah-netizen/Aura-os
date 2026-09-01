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
  const tenantId = 'tenant-b4';
  const handoverId = `handover-${sourceKind.toLowerCase()}`;
  const contractId = `contract-${sourceKind.toLowerCase()}`;
  const sourceItemId = sourceKind === 'TENDER' ? 'BOQ-1' : null;
  const sourceRevisionRef = sourceKind === 'TENDER' ? 'boq-rev-1' : 'quote-rev-1';
  const frozenItemKey = sourceKind === 'TENDER' ? 'TENDER|boq-rev-1|BOQ-1' : 'DIRECT|quote-rev-1|LINE|0';
  const snapshot: FrozenDeliverySource = {
    schemaVersion: 1, handoverId, contractId, tenantId, sourceKind,
    sourceOpportunityId: sourceKind === 'DIRECT' ? 'opp-b4' : null,
    sourceTenderId: sourceKind === 'TENDER' ? 'tender-b4' : null,
    commercialScopeRevisionId: null, boqRevisionId: sourceKind === 'TENDER' ? 'boq-rev-1' : null,
    estimateRevisionId: null, acceptedQuotationId: 'quote-b4', acceptedQuotationRevisionId: 'quote-rev-1',
    commercialBaselineId: 'baseline-b4', originalContractValue: 5000, currency: 'AED',
    awardAcceptanceType: sourceKind === 'TENDER' ? 'tender_award' : 'quotation_acceptance',
    awardAcceptanceEvidence: { sourceKind }, frozenCommercialBaseline: { id: 'baseline-b4' },
    sourceItems: [{
      frozenItemKey, sourceKind, sourceId: sourceKind === 'TENDER' ? 'tender-b4' : 'opp-b4', sourceRevisionRef,
      sourceItemId, itemCode: sourceItemId, description: 'Frozen item', unit: 'nr', soldQuantity: 10,
      customerUnitPrice: 500, customerLineValue: 5000, costEvidence: null,
      sourceSnapshot: { quantity: 10, unit: 'nr' }, unavailableReason: null,
    }],
    capturedAt: '2026-08-31T10:00:00.000Z',
  };
  const projects = new InMemoryProjectStore();
  const wbs = new InMemoryWbsStore();
  const cbs = new InMemoryCbsStore();
  const maps = new InMemoryDeliveryItemMapStore();
  const project = makeProject({ tenantId, title: `${sourceKind} project`, origin: 'commercial_handover', contractId, handoverId, handoverSnapshot: snapshot, handoverSnapshotHash: hashHandoverSnapshot(snapshot), handoverLockedAt: snapshot.capturedAt });
  const wbsNode = makeWbsNode({ tenantId, projectId: project.id, code: '1', title: 'Work' });
  const cbsNode = makeCbsNode({ tenantId, projectId: project.id, code: '01', title: 'Cost' });
  const mapService = new DeliveryItemMapService(maps, projects, wbs, cbs, null);
  return { tenantId, contractId, snapshot, projects, wbs, cbs, maps, project, wbsNode, cbsNode, mapService };
}

async function mapping(fx: ReturnType<typeof setup>, key = fx.snapshot.sourceItems![0].frozenItemKey) {
  await fx.projects.create(fx.project); await fx.wbs.create(fx.wbsNode); await fx.cbs.create(fx.cbsNode);
  const item = fx.snapshot.sourceItems!.find((candidate) => candidate.frozenItemKey === key)!;
  return fx.mapService.create({
    tenantId: fx.tenantId, projectId: fx.project.id, handoverId: fx.project.handoverId!, frozenItemKey: item.frozenItemKey,
    sourceKind: item.sourceKind, sourceId: item.sourceId, sourceRevisionRef: item.sourceRevisionRef, sourceItemId: item.sourceItemId,
    wbsNodeId: fx.wbsNode.id, cbsNodeId: fx.cbsNode.id,
  });
}

describe('QuantityLedgerService — governed Certified quantity', () => {
  it('posts independent Certified facts for Tender and Direct frozen items', async () => {
    for (const sourceKind of ['TENDER', 'DIRECT'] as const) {
      const fx = setup(sourceKind); const map = await mapping(fx); const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
      const txn = await ledger.postCertified({ tenantId: fx.tenantId, contractId: fx.contractId, certificateId: `cert-${sourceKind}`, ipcLineId: `line-${sourceKind}`, projectId: fx.project.id, boqItemId: map.sourceItemId ?? map.frozenItemKey, quantity: 6, unit: 'nr', certifiedAt: '2026-08-31T11:00:00.000Z' });
      expect(txn).toMatchObject({ type: 'invoiced', source: 'ipc', semantic: 'certified', quantity: 6, unit: 'nr', sourceRef: `ipc:cert-${sourceKind}:line:line-${sourceKind}`, dedupeKey: `certified:cert-${sourceKind}:line-${sourceKind}` });
      expect((await ledger.position(fx.tenantId, txn!.boqItemId)).certified).toBe(6);
    }
  });

  it('requires frozen mapping and contract/tenant/project membership', async () => {
    const fx = setup(); const map = await mapping(fx); const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    const base = { tenantId: fx.tenantId, contractId: fx.contractId, certificateId: 'cert-1', ipcLineId: 'line-1', projectId: fx.project.id, boqItemId: map.frozenItemKey, quantity: 3, unit: 'nr' };
    await expect(ledger.postCertified({ ...base, tenantId: 'other-tenant' })).rejects.toThrow();
    await expect(ledger.postCertified({ ...base, projectId: 'other-project' })).rejects.toThrow();
    await expect(ledger.postCertified({ ...base, contractId: 'other-contract' })).rejects.toThrow();
    await expect(ledger.postCertified({ ...base, boqItemId: 'unknown-item' })).rejects.toThrow();
  });

  it('is replay-safe, rejects conflicting replay, and distinguishes legacy invoiced rows', async () => {
    const fx = setup(); const map = await mapping(fx); const store = new InMemoryQuantityLedgerStore(); const ledger = new QuantityLedgerService(store, fx.mapService);
    const base = { tenantId: fx.tenantId, contractId: fx.contractId, certificateId: 'cert-1', ipcLineId: 'line-1', projectId: fx.project.id, boqItemId: map.frozenItemKey, quantity: 3, unit: 'nr' };
    const first = await ledger.postCertified(base); const replay = await ledger.postCertified(base);
    expect(replay?.id).toBe(first?.id);
    await expect(ledger.postCertified({ ...base, quantity: 4 })).rejects.toThrow(/conflicting Certified replay|frozen item evidence/);
    await ledger.post({ tenantId: fx.tenantId, projectId: fx.project.id, boqItemId: map.frozenItemKey, type: 'invoiced', quantity: 2, unit: 'nr', source: 'ipc', sourceRef: 'legacy-ipc' });
    const pos = await ledger.position(fx.tenantId, map.frozenItemKey);
    expect(pos.invoiced).toBe(5); expect(pos.certified).toBe(3); expect(pos.legacyInvoiced).toBe(2);
  });

  it('does not post missing quantity or unit evidence, and leaves upstream facts unchanged', async () => {
    const fx = setup(); const map = await mapping(fx); const store = new InMemoryQuantityLedgerStore(); const ledger = new QuantityLedgerService(store, fx.mapService);
    await ledger.postSold({ mapping: map, soldQuantity: 10, unit: 'nr' });
    await expect(ledger.postCertified({ tenantId: fx.tenantId, contractId: fx.contractId, certificateId: 'cert-unknown', ipcLineId: 'line-unknown', projectId: fx.project.id, boqItemId: map.frozenItemKey, quantity: null, unit: 'nr' })).resolves.toBeNull();
    await expect(ledger.postCertified({ tenantId: fx.tenantId, contractId: fx.contractId, certificateId: 'cert-bad-unit', ipcLineId: 'line-bad-unit', projectId: fx.project.id, boqItemId: map.frozenItemKey, quantity: 2, unit: null })).rejects.toThrow(/unit evidence/);
    await ledger.post({ tenantId: fx.tenantId, projectId: fx.project.id, boqItemId: map.frozenItemKey, type: 'installed', quantity: 4, unit: 'nr', source: 'installation', sourceRef: 'install-1' });
    const pos = await ledger.position(fx.tenantId, map.frozenItemKey);
    expect(pos.certified).toBeNull(); expect(pos.installed).toBe(4); expect(pos.sold).toBe(10);
    expect((await fx.projects.get(fx.project.id))!.handoverSnapshotHash).toBe(hashHandoverSnapshot(fx.snapshot));
    expect(await fx.maps.get(map.id)).toEqual(map);
  });

  it('applies append-only Certified corrections and keeps replay/conflict/bounds governed', async () => {
    const fx = setup(); const map = await mapping(fx); const store = new InMemoryQuantityLedgerStore(); const ledger = new QuantityLedgerService(store, fx.mapService);
    const original = await ledger.postCertified({ tenantId: fx.tenantId, contractId: fx.contractId, certificateId: 'cert-correction', ipcLineId: 'line-correction', projectId: fx.project.id, boqItemId: map.frozenItemKey, quantity: 10, unit: 'nr' });
    const correctionInput = {
      tenantId: fx.tenantId, projectId: fx.project.id, contractId: fx.contractId,
      certificateId: 'cert-correction', ipcLineId: 'line-correction', correctionId: 'corr-1',
      signedQuantityDelta: -2, reason: 'quantity reconciliation', actorId: 'qs-1', unit: 'nr',
    };
    const correction = await ledger.correctCertified(correctionInput);
    expect(correction).toMatchObject({ type: 'invoiced', source: 'adjustment', semantic: 'certified', quantity: -2, dedupeKey: 'certified-correction:line-correction:corr-1' });
    expect(correction.dimensions).toMatchObject({ originalCertificateId: 'cert-correction', originalIpcLineId: 'line-correction', correctionId: 'corr-1', signedQuantityDelta: '-2', reason: 'quantity reconciliation', actorId: 'qs-1' });
    expect((await ledger.position(fx.tenantId, map.frozenItemKey)).certified).toBe(8);
    expect((await ledger.list({ tenantId: fx.tenantId, projectId: fx.project.id })).find((row) => row.id === original!.id)?.quantity).toBe(10);

    const replay = await ledger.correctCertified(correctionInput);
    expect(replay.id).toBe(correction.id);
    await expect(ledger.correctCertified({ ...correctionInput, reason: 'different reason' })).rejects.toThrow(/conflicting Certified correction replay/);
    await expect(ledger.correctCertified({ ...correctionInput, correctionId: 'corr-too-large', signedQuantityDelta: -9 })).rejects.toThrow(/negative effective quantity/);
    await expect(ledger.correctCertified({ ...correctionInput, correctionId: 'corr-no-actor', actorId: '' })).rejects.toThrow(/requires correctionId, reason and actor/);
  });

  it('supports a full append-only reversal without changing the original fact', async () => {
    const fx = setup(); const map = await mapping(fx); const store = new InMemoryQuantityLedgerStore(); const ledger = new QuantityLedgerService(store, fx.mapService);
    const original = await ledger.postCertified({ tenantId: fx.tenantId, contractId: fx.contractId, certificateId: 'cert-reversal', ipcLineId: 'line-reversal', projectId: fx.project.id, boqItemId: map.frozenItemKey, quantity: 10, unit: 'nr' });
    const reversal = await ledger.correctCertified({ tenantId: fx.tenantId, projectId: fx.project.id, contractId: fx.contractId, certificateId: 'cert-reversal', ipcLineId: 'line-reversal', correctionId: 'reverse-1', signedQuantityDelta: -10, reason: 'certificate withdrawn', actorId: 'qs-1', unit: 'nr' });
    expect(reversal.quantity).toBe(-10);
    expect((await ledger.position(fx.tenantId, map.frozenItemKey)).certified).toBe(0);
    expect((await ledger.list({ tenantId: fx.tenantId, projectId: fx.project.id })).find((row) => row.id === original!.id)?.quantity).toBe(10);
  });
});
