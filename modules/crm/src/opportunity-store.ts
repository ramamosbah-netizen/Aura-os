import type { Id, Opportunity, OpportunityStage, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';

export const CRM_OPPORTUNITY_STORE = Symbol('CRM_OPPORTUNITY_STORE');

export interface OpportunityFilter {
  tenantId?: string;
  stage?: OpportunityStage;
  leadId?: string;
  accountId?: string;
  /** Whose deals. See ActivityFilter.assigneeId. */
  ownerId?: string;
  limit?: number;
}

export interface OpportunityStore {
  create(opportunity: Opportunity): Promise<void>;
  createWithClient(tx: TxHandle | null, opportunity: Opportunity): Promise<void>;
  update(opportunity: Opportunity): Promise<void>;
  /**
   * Update inside a caller-provided transaction. `tx === null` degrades to a plain `update`. Without
   * this, an update issued inside `tx.run` runs on a SEPARATE pooled connection and escapes the
   * transaction — so the opportunity change and its event append would NOT commit or roll back as one.
   */
  updateWithClient(tx: TxHandle | null, opportunity: Opportunity): Promise<void>;
  get(id: Id): Promise<Opportunity | null>;
  list(filter?: OpportunityFilter): Promise<Opportunity[]>;
  listPaged(filter: OpportunityFilter, page: PageParams): Promise<Page<Opportunity>>;
}
