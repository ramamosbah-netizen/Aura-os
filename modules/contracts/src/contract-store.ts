import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Contract } from './domain/contract';

/** DI token for the contract store. */
export const CONTRACT_STORE = Symbol('CONTRACT_STORE');

export interface ContractFilter {
  tenantId?: string;
  status?: string;
  accountId?: string;
  tenderId?: string;
  limit?: number;
}

export interface ContractStore {
  create(contract: Contract): Promise<void>;
  /** Insert on a caller-owned transaction (atomic with its event); null tx falls back to create. */
  createWithClient(tx: TxHandle | null, contract: Contract): Promise<void>;
  update(contract: Contract): Promise<void>;
  get(id: Id): Promise<Contract | null>;
  list(filter?: ContractFilter): Promise<Contract[]>;
}
