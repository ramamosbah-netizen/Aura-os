import type { Id } from '@aura/shared';
import type { ContractNegotiationItem } from './domain/contract-negotiation';

export const CONTRACT_NEGOTIATION_STORE = Symbol('CONTRACT_NEGOTIATION_STORE');
export interface ContractNegotiationStore {
  create(item: ContractNegotiationItem): Promise<void>;
  get(id: Id): Promise<ContractNegotiationItem | null>;
  list(tenantId: Id, contractId: Id, revisionId?: Id): Promise<ContractNegotiationItem[]>;
  update(item: ContractNegotiationItem): Promise<void>;
}

