import type { Id, Page, PageParams } from '@aura/shared';
import type { ContractObligation } from './domain/contract-obligation';

export const OBLIGATION_STORE = Symbol('OBLIGATION_STORE');

export interface ObligationFilter {
  tenantId?: string;
  contractId?: string;
  status?: string;
  limit?: number;
}

export interface ObligationStore {
  save(obligation: ContractObligation): Promise<void>;
  get(id: Id): Promise<ContractObligation | null>;
  list(filter?: ObligationFilter): Promise<ContractObligation[]>;
  listPaged(filter: ObligationFilter, page: PageParams): Promise<Page<ContractObligation>>;
}
