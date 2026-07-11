import type { Id, Opportunity, OpportunityStage, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';

export const CRM_OPPORTUNITY_STORE = Symbol('CRM_OPPORTUNITY_STORE');

export interface OpportunityFilter {
  tenantId?: string;
  stage?: OpportunityStage;
  leadId?: string;
  accountId?: string;
  limit?: number;
}

export interface OpportunityStore {
  create(opportunity: Opportunity): Promise<void>;
  createWithClient(tx: TxHandle | null, opportunity: Opportunity): Promise<void>;
  update(opportunity: Opportunity): Promise<void>;
  get(id: Id): Promise<Opportunity | null>;
  list(filter?: OpportunityFilter): Promise<Opportunity[]>;
  listPaged(filter: OpportunityFilter, page: PageParams): Promise<Page<Opportunity>>;
}
