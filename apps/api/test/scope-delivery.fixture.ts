import type { INestApplication } from '@nestjs/common';
import { PROJECT_STORE, type ProjectStore, hashHandoverSnapshot, type FrozenDeliverySource } from '@aura/projects';

/** Frozen source fixture. No quantity, certification or handover rule is disabled for this proof. */
export async function deliveryFixture(app: INestApplication, tenantId: string, projectId: string) {
  const store = app.get<ProjectStore>(PROJECT_STORE);
  const p = (await store.get(projectId))!;
  const key = `DIRECT|${projectId}|LINE|0`;
  const snapshot: FrozenDeliverySource = {
    schemaVersion: 1, handoverId: `handover-${projectId}`, contractId: `contract-${projectId}`, tenantId,
    sourceKind: 'DIRECT', sourceOpportunityId: 'opp-scope', sourceTenderId: null,
    commercialScopeRevisionId: null, boqRevisionId: null, estimateRevisionId: 'estimate-scope',
    acceptedQuotationId: 'quote-scope', acceptedQuotationRevisionId: projectId,
    commercialBaselineId: 'baseline-scope', originalContractValue: 1200, currency: 'AED',
    awardAcceptanceType: 'quotation_acceptance', awardAcceptanceEvidence: { acceptedAt: '2026-09-01T00:00:00.000Z' },
    frozenCommercialBaseline: { id: 'baseline-scope', total: 1200 },
    sourceItems: [{ frozenItemKey: key, sourceKind: 'DIRECT', sourceId: 'opp-scope',
      sourceRevisionRef: projectId, sourceItemId: null, itemCode: null, description: 'Cable installation',
      unit: 'm', soldQuantity: 12, customerUnitPrice: 100, customerLineValue: 1200, costEvidence: null,
      sourceSnapshot: { description: 'Cable installation', quantity: 12 }, unavailableReason: null }],
    capturedAt: '2026-09-01T00:00:00.000Z',
  };
  await store.update({ ...p, origin: 'commercial_handover', contractId: snapshot.contractId,
    handoverId: snapshot.handoverId, handoverSnapshot: snapshot, handoverSnapshotHash: hashHandoverSnapshot(snapshot),
    handoverLockedAt: snapshot.capturedAt });
  return { tenantId, projectId, handoverId: snapshot.handoverId, frozenItemKey: key,
    sourceKind: 'DIRECT' as const, sourceId: 'opp-scope', sourceRevisionRef: projectId,
    sourceItemId: null, wbsNodeId: null, cbsNodeId: null };
}
