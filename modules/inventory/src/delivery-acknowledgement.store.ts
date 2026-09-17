import type { Id } from '@aura/shared';

/**
 * Receipts for material delivered to a work package (`BUY-07`).
 *
 * The record carries no quantity. What was delivered is derived from the movements; this says only
 * that a named person accepted receipt of one of them.
 */
export interface DeliveryAcknowledgement {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** The already-persisted movement being acknowledged. One receipt per movement. */
  movementId: Id;
  /** Copied from the movement's own declared destination — never inferred, never recomputed. */
  wbsNodeId: Id;
  projectId: Id;
  acknowledgedBy: Id;
  acknowledgedAt: string;
  note: string | null;
  createdAt: string;
}

export const DELIVERY_ACK_STORE = Symbol('DELIVERY_ACK_STORE');

export interface DeliveryAcknowledgementStore {
  create(value: DeliveryAcknowledgement): Promise<void>;
  getByMovement(tenantId: Id, movementId: Id): Promise<DeliveryAcknowledgement | null>;
  listByWorkPackage(tenantId: Id, wbsNodeId: Id): Promise<DeliveryAcknowledgement[]>;
}
