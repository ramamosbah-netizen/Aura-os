import type { Id } from '@aura/shared';
import type { ContractBond } from './domain/contract-bond';

/** DI token for the contract bond/guarantee store. */
export const CONTRACT_BOND_STORE = Symbol('CONTRACT_BOND_STORE');

export interface BondFilter {
  tenantId?: string;
  contractId?: string;
  status?: string;
}

export interface BondStore {
  save(bond: ContractBond): Promise<void>;
  get(id: Id): Promise<ContractBond | null>;
  list(filter?: BondFilter): Promise<ContractBond[]>;
}
