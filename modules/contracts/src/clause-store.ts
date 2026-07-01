import type { Id, Page, PageParams } from '@aura/shared';
import type { ContractClause } from './domain/contract-clause';

export const CLAUSE_STORE = Symbol('CLAUSE_STORE');

export interface ClauseFilter {
  tenantId?: string;
  category?: string;
  active?: boolean;
  limit?: number;
}

export interface ClauseStore {
  save(clause: ContractClause): Promise<void>;
  get(id: Id): Promise<ContractClause | null>;
  list(filter?: ClauseFilter): Promise<ContractClause[]>;
  listPaged(filter: ClauseFilter, page: PageParams): Promise<Page<ContractClause>>;
}
