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

function setup() {
  const tenantId = 'tenant-billed';
  const contractId = 'contract-billed';
  const handoverId = 'handover-billed';
  const frozenItemKey = 'TENDER|boq-rev-1|BOQ-1';
  const snapshot: FrozenDeliverySource = {
    schemaVersion: 1, handoverId, contractId, tenantId, sourceKind: 'TENDER',
    sourceOpportunityId: null, sourceTenderId: 'tender-billed', commercialScopeRevisionId: null,
    boqRevisionId: 'boq-rev-1', estimateRevisionId: null, acceptedQuotationId: 'quote-billed',
    acceptedQuotationRevisionId: 'quote-rev-1', commercialBaselineId: 'baseline-billed',
    originalContractValue: 5000, currency: 'AED', awardAcceptanceType: 'tender_award',
    awardAcceptanceEvidence: { sourceKind: 'TENDER' }, frozenCommercialBaseline: { id: 'baseline-billed' },
    sourceItems: [{ frozenItemKey, sourceKind: 'TENDER', sourceId: 'tender-billed', sourceRevisionRef: 'boq-rev-1',
      sourceItemId: 'BOQ-1', itemCode: 'BOQ-1', description: 'Frozen item', unit: 'nr', soldQuantity: 10,
      customerUnitPrice: 500, customerLineValue: 5000, costEvidence: null, sourceSnapshot: { quantity: 10, unit: 'nr' }, unavailableReason: null }],
    capturedAt: '2026-08-31T10:00:00.000Z',
  };
  const projects = new InMemoryProjectStore();
  const wbs = new InMemoryWbsStore();
  const cbs = new InMemoryCbsStore();
  const maps = new InMemoryDeliveryItemMapStore();
  const project = makeProject({ tenantId, title: 'Billed project', origin: 'commercial_handover', contractId, handoverId,
    handoverSnapshot: snapshot, handoverSnapshotHash: hashHandoverSnapshot(snapshot), handoverLockedAt: snapshot.capturedAt });
  const wbsNode = makeWbsNode({ tenantId, projectId: project.id, code: '1', title: 'Work' });
  const cbsNode = makeCbsNode({ tenantId, projectId: project.id, code: '01', title: 'Cost' });
  const mapService = new DeliveryItemMapService(maps, projects, wbs, cbs, null);
  return { tenantId, projectId: project.id, contractId, snapshot, projects, wbs, cbs, maps, project, wbsNode, cbsNode, mapService };
}

async function mapped(fx: ReturnType<typeof setup>) {
  await fx.projects.create(fx.project); await fx.wbs.create(fx.wbsNode); await fx.cbs.create(fx.cbsNode);
  const item = fx.snapshot.sourceItems![0];
  return fx.mapService.create({ tenantId: fx.tenantId, projectId: fx.projectId, handoverId: fx.project.handoverId!, frozenItemKey: item.frozenItemKey,
    sourceKind: item.sourceKind, sourceId: item.sourceId, sourceRevisionRef: item.sourceRevisionRef, sourceItemId: item.sourceItemId,
    wbsNodeId: fx.wbsNode.id, cbsNodeId: fx.cbsNode.id });
}

describe('QuantityLedgerService — AR Billed quantity', () => {
  it('posts Billed only from an issued-line identity and keeps Certified separate', async () => {
    const fx = setup(); const map = await mapped(fx); const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    const billed = await ledger.postBilled({ tenantId: fx.tenantId, invoiceId: 'invoice-1', invoiceLineId: 'line-1', projectId: fx.projectId,
      contractId: fx.contractId, frozenItemKey: map.frozenItemKey, boqItemId: map.sourceItemId, quantity: 4, unit: 'nr', billedNet: 2000,
      issuedAt: '2026-08-31T12:00:00.000Z' });
    expect(billed).toMatchObject({ type: 'invoiced', source: 'customer_invoice', semantic: 'billed', quantity: 4,
      sourceRef: 'customer-invoice:invoice-1:line:line-1', dedupeKey: 'billed:invoice-1:line-1' });
    const pos = await ledger.position(fx.tenantId, map.sourceItemId!);
    expect(pos.billed).toBe(4); expect(pos.certified).toBeNull(); expect(pos.legacyInvoiced).toBe(0);
  });

  it('is replay-safe, rejects conflicts, and does not fabricate UNKNOWN as zero', async () => {
    const fx = setup(); const map = await mapped(fx); const store = new InMemoryQuantityLedgerStore(); const ledger = new QuantityLedgerService(store, fx.mapService);
    const input = { tenantId: fx.tenantId, invoiceId: 'invoice-2', invoiceLineId: 'line-2', projectId: fx.projectId, contractId: fx.contractId,
      frozenItemKey: map.frozenItemKey, boqItemId: map.sourceItemId, quantity: 3, unit: 'nr' };
    const first = await ledger.postBilled(input); const replay = await ledger.postBilled(input);
    expect(replay?.id).toBe(first?.id);
    await expect(ledger.postBilled({ ...input, quantity: 4 })).rejects.toThrow(/conflicting Billed replay/);
    await expect(ledger.postBilled({ ...input, invoiceId: 'invoice-unknown', frozenItemKey: 'missing' })).rejects.toThrow(/does not resolve/);
    await expect(ledger.postBilled({ ...input, invoiceId: 'invoice-null', quantity: null })).resolves.toBeNull();
    expect((await ledger.position(fx.tenantId, map.sourceItemId!)).billed).toBe(3);
  });

  it('cancels through an append-only compensating fact without rewriting the original', async () => {
    const fx = setup(); const map = await mapped(fx); const store = new InMemoryQuantityLedgerStore(); const ledger = new QuantityLedgerService(store, fx.mapService);
    const original = await ledger.postBilled({ tenantId: fx.tenantId, invoiceId: 'invoice-3', invoiceLineId: 'line-3', projectId: fx.projectId,
      contractId: fx.contractId, frozenItemKey: map.frozenItemKey, boqItemId: map.sourceItemId, quantity: 5, unit: 'nr' });
    const reversal = await ledger.reverseBilled({ tenantId: fx.tenantId, invoiceId: 'invoice-3', invoiceLineId: 'line-3', projectId: fx.projectId,
      contractId: fx.contractId, frozenItemKey: map.frozenItemKey, boqItemId: map.sourceItemId, quantity: 5, unit: 'nr', cancelledAt: '2026-08-31T13:00:00.000Z' });
    expect(reversal).toMatchObject({ quantity: -5, semantic: 'billed', source: 'adjustment', dedupeKey: 'billed-cancellation:invoice-3:line-3' });
    expect((await ledger.position(fx.tenantId, map.sourceItemId!)).billed).toBe(0);
    expect((await ledger.list({ tenantId: fx.tenantId, projectId: fx.projectId })).find((row) => row.id === original!.id)?.quantity).toBe(5);
    const replay = await ledger.reverseBilled({ tenantId: fx.tenantId, invoiceId: 'invoice-3', invoiceLineId: 'line-3', projectId: fx.projectId,
      contractId: fx.contractId, frozenItemKey: map.frozenItemKey, boqItemId: map.sourceItemId, quantity: 5, unit: 'nr' });
    expect(replay?.id).toBe(reversal?.id);
  });

  it('does not silently rewrite Billed when a later Certified correction changes Certified', async () => {
    const fx = setup(); const map = await mapped(fx); const ledger = new QuantityLedgerService(new InMemoryQuantityLedgerStore(), fx.mapService);
    await ledger.postCertified({ tenantId: fx.tenantId, contractId: fx.contractId, certificateId: 'cert-4', ipcLineId: 'line-4', projectId: fx.projectId,
      boqItemId: map.sourceItemId!, quantity: 10, unit: 'nr' });
    await ledger.postBilled({ tenantId: fx.tenantId, invoiceId: 'invoice-4', invoiceLineId: 'line-4', projectId: fx.projectId, contractId: fx.contractId,
      frozenItemKey: map.frozenItemKey, boqItemId: map.sourceItemId, quantity: 10, unit: 'nr' });
    await ledger.correctCertified({ tenantId: fx.tenantId, projectId: fx.projectId, contractId: fx.contractId, certificateId: 'cert-4', ipcLineId: 'line-4',
      correctionId: 'corr-4', signedQuantityDelta: -2, reason: 'certified reconciliation', actorId: 'qs-4', unit: 'nr' });
    const pos = await ledger.position(fx.tenantId, map.sourceItemId!);
    expect(pos.certified).toBe(8);
    expect(pos.billed).toBe(10);
  });
});
