import { createHash } from 'node:crypto';

/** JSON-safe frozen commercial handover evidence. */
export type HandoverSnapshot = Record<string, unknown>;

/** Version stamped source envelope persisted at Contract → Project handover. */
export const HANDOVER_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export type HandoverSourceKind = 'DIRECT' | 'TENDER';

export interface FrozenDeliverySourceItem {
  frozenItemKey: string;
  sourceKind: HandoverSourceKind;
  sourceId: string | null;
  sourceRevisionRef: string | null;
  sourceItemId: string | null;
  itemCode: string | null;
  description: string;
  unit: string | null;
  soldQuantity: number | null;
  customerUnitPrice: number | null;
  customerLineValue: number | null;
  costEvidence: Record<string, unknown> | null;
  sourceSnapshot: Record<string, unknown>;
  unavailableReason: string | null;
}

/**
 * The B1 contract: source facts captured from the signed contract event and the
 * exact locked commercial evidence it names. Item-level evidence is deliberately
 * owned by B2 and may be added without changing this envelope's source identity.
 */
export interface FrozenDeliverySource extends HandoverSnapshot {
  schemaVersion: typeof HANDOVER_SNAPSHOT_SCHEMA_VERSION;
  handoverId: string;
  contractId: string;
  tenantId: string;
  sourceKind: HandoverSourceKind;
  sourceOpportunityId: string | null;
  sourceTenderId: string | null;
  commercialScopeRevisionId: string | null;
  boqRevisionId: string | null;
  estimateRevisionId: string | null;
  acceptedQuotationId: string | null;
  acceptedQuotationRevisionId: string | null;
  commercialBaselineId: string | null;
  originalContractValue: number | null;
  currency: string | null;
  awardAcceptanceType: 'quotation_acceptance' | 'tender_award' | 'manual' | null;
  awardAcceptanceEvidence: Record<string, unknown> | null;
  frozenCommercialBaseline: Record<string, unknown> | null;
  /** Item-level evidence is optional for legacy handovers and is owned by B2. */
  sourceItems?: FrozenDeliverySourceItem[];
  /** ISO-8601 time of the signed-contract event that captured the envelope. */
  capturedAt: string;
}

/** Runtime boundary for commercial handovers; legacy arbitrary JSON remains hashable. */
export function isFrozenDeliverySource(snapshot: HandoverSnapshot | null): snapshot is FrozenDeliverySource {
  if (!snapshot || snapshot.schemaVersion !== HANDOVER_SNAPSHOT_SCHEMA_VERSION) return false;
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(snapshot, key);
  const required = [
    'handoverId', 'contractId', 'tenantId', 'sourceKind',
    'sourceOpportunityId', 'sourceTenderId', 'commercialScopeRevisionId', 'boqRevisionId',
    'estimateRevisionId', 'acceptedQuotationId', 'acceptedQuotationRevisionId',
    'commercialBaselineId', 'originalContractValue', 'currency', 'awardAcceptanceType',
    'awardAcceptanceEvidence', 'frozenCommercialBaseline', 'capturedAt',
  ];
  if (required.some((key) => !has(key))) return false;
  if (typeof snapshot.handoverId !== 'string' || snapshot.handoverId.trim().length === 0) return false;
  if (typeof snapshot.contractId !== 'string' || snapshot.contractId.trim().length === 0) return false;
  if (typeof snapshot.tenantId !== 'string' || snapshot.tenantId.trim().length === 0) return false;
  if (snapshot.sourceKind !== 'DIRECT' && snapshot.sourceKind !== 'TENDER') return false;
  const nullableStringFields: Array<keyof FrozenDeliverySource> = [
    'sourceOpportunityId', 'sourceTenderId', 'commercialScopeRevisionId', 'boqRevisionId',
    'estimateRevisionId', 'acceptedQuotationId', 'acceptedQuotationRevisionId',
    'commercialBaselineId', 'currency',
  ];
  if (nullableStringFields.some((key) => snapshot[key] !== null && typeof snapshot[key] !== 'string')) return false;
  if (snapshot.originalContractValue !== null
    && (typeof snapshot.originalContractValue !== 'number' || !Number.isFinite(snapshot.originalContractValue))) return false;
  if (snapshot.awardAcceptanceType !== null
    && snapshot.awardAcceptanceType !== 'quotation_acceptance'
    && snapshot.awardAcceptanceType !== 'tender_award'
    && snapshot.awardAcceptanceType !== 'manual') return false;
  if (snapshot.awardAcceptanceEvidence !== null
    && (typeof snapshot.awardAcceptanceEvidence !== 'object' || Array.isArray(snapshot.awardAcceptanceEvidence))) return false;
  if (snapshot.frozenCommercialBaseline !== null
    && (typeof snapshot.frozenCommercialBaseline !== 'object' || Array.isArray(snapshot.frozenCommercialBaseline))) return false;
  if (snapshot.sourceItems !== undefined && !Array.isArray(snapshot.sourceItems)) return false;
  if (typeof snapshot.capturedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.capturedAt))) return false;
  return true;
}

/** Stable key for a frozen item; never depends on a mutable description or latest row position. */
export function frozenItemKey(input: {
  sourceKind: HandoverSourceKind;
  sourceRevisionRef?: string | null;
  sourceItemId?: string | null;
  fallbackRef: string;
  lineIndex?: number;
}): string {
  const revision = input.sourceRevisionRef?.trim() || input.fallbackRef.trim();
  const itemId = input.sourceItemId?.trim();
  if (itemId) return `${input.sourceKind}|${revision}|${itemId}`;
  const index = input.lineIndex;
  if (index === undefined || !Number.isInteger(index) || index < 0) {
    return `${input.sourceKind}|${revision}|UNAVAILABLE`;
  }
  return `${input.sourceKind}|${revision}|LINE|${index}`;
}

/** Canonical JSON: recursively sorted object keys; array order remains business-significant. */
export function canonicalizeHandoverSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeHandoverSnapshot);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        // Compare UTF-16 key order directly; localeCompare can vary by host locale.
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalizeHandoverSnapshot(entry)]),
    );
  }
  return value;
}

export function serializeHandoverSnapshot(snapshot: HandoverSnapshot): string {
  return JSON.stringify(canonicalizeHandoverSnapshot(snapshot));
}

export function hashHandoverSnapshot(snapshot: HandoverSnapshot): string {
  return createHash('sha256').update(serializeHandoverSnapshot(snapshot)).digest('hex');
}

/** Recompute the persisted evidence hash without consulting any live source. */
export function verifyHandoverSnapshotHash(snapshot: HandoverSnapshot, expectedHash: string): boolean {
  return hashHandoverSnapshot(snapshot) === expectedHash;
}
