import type { Id, Lead, LeadStatus, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';

export const CRM_LEAD_STORE = Symbol('CRM_LEAD_STORE');

export interface LeadFilter {
  tenantId?: string;
  status?: LeadStatus;
  /** Whose leads. See ActivityFilter.assigneeId. */
  assignedTo?: string;
  limit?: number;
}

export interface LeadStore {
  create(lead: Lead): Promise<void>;
  createWithClient(tx: TxHandle | null, lead: Lead): Promise<void>;
  update(lead: Lead): Promise<void>;
  /** Update on a caller-owned transaction (atomic with its event); null tx falls back to update. */
  updateWithClient(tx: TxHandle | null, lead: Lead): Promise<void>;
  get(id: Id): Promise<Lead | null>;
  /**
   * Read a lead FOR UPDATE on a caller-owned transaction — the row is locked until the tx commits,
   * so the read gives authoritative pre-transition state (status + qualification evidence live on
   * the same row) and blocks concurrent writers. Used by the serialized qualify transition. A null
   * tx (no-DB dev) falls back to an unlocked get — deterministic, but not a concurrency guarantee.
   */
  getForUpdateWithClient(tx: TxHandle | null, id: Id): Promise<Lead | null>;
  list(filter?: LeadFilter): Promise<Lead[]>;
  listPaged(filter: LeadFilter, page: PageParams): Promise<Page<Lead>>;
}
