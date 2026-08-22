import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { QualificationDecision } from './domain/qualification-decision';

export const CRM_QUALIFICATION_DECISION_STORE = Symbol('CRM_QUALIFICATION_DECISION_STORE');

/**
 * Append-only store for lead qualification decisions. Deliberately NOT a generic CRUD store: there
 * is no update and no delete — a decision is a historical fact. The only writes are appends; the
 * only reads are by lead (the audit trail) and by id. The Postgres table additionally forbids
 * UPDATE/DELETE at the database with triggers, so append-only is enforced, not merely conventional.
 */
export interface QualificationDecisionStore {
  append(decision: QualificationDecision): Promise<void>;
  /** Append on a caller-owned transaction, so the decision commits atomically with the lifecycle
   *  status change and its event. A null tx (no-DB dev) falls back to a direct append. */
  appendWithClient(tx: TxHandle | null, decision: QualificationDecision): Promise<void>;
  get(id: Id): Promise<QualificationDecision | null>;
  /** The full decision history for a lead, newest first (tenant-scoped). */
  listForLead(tenantId: Id, leadId: Id): Promise<QualificationDecision[]>;
}
