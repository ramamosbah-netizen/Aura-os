import { type Id, newId } from '@aura/shared';
import type { HandoverSourceKind } from './handover';

/** Immutable proof that a frozen handover item is mapped to delivery structures. */
export interface DeliveryItemMap {
  id: Id;
  tenantId: Id;
  projectId: Id;
  handoverId: Id;
  frozenItemKey: string;
  sourceKind: HandoverSourceKind;
  sourceId: string | null;
  sourceRevisionRef: string | null;
  sourceItemId: string | null;
  wbsNodeId: Id | null;
  cbsNodeId: Id | null;
  createdAt: string;
  immutableAt: string;
}

export interface NewDeliveryItemMap {
  tenantId: Id;
  projectId: Id;
  handoverId: Id;
  frozenItemKey: string;
  sourceKind: HandoverSourceKind;
  sourceId?: string | null;
  sourceRevisionRef?: string | null;
  sourceItemId?: string | null;
  wbsNodeId?: Id | null;
  cbsNodeId?: Id | null;
  createdAt?: string;
  immutableAt?: string;
}

export function makeDeliveryItemMap(input: NewDeliveryItemMap): DeliveryItemMap {
  const now = new Date().toISOString();
  if (!input.frozenItemKey.trim()) throw new Error('frozenItemKey is required');
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    handoverId: input.handoverId,
    frozenItemKey: input.frozenItemKey.trim(),
    sourceKind: input.sourceKind,
    sourceId: input.sourceId?.trim() || null,
    sourceRevisionRef: input.sourceRevisionRef?.trim() || null,
    sourceItemId: input.sourceItemId?.trim() || null,
    wbsNodeId: input.wbsNodeId ?? null,
    cbsNodeId: input.cbsNodeId ?? null,
    createdAt: input.createdAt ?? now,
    immutableAt: input.immutableAt ?? now,
  };
}
