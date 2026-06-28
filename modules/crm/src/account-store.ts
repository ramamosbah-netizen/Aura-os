import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Account } from './domain/account';

/** DI token for the CRM account store. */
export const CRM_ACCOUNT_STORE = Symbol('CRM_ACCOUNT_STORE');

export interface AccountFilter {
  tenantId?: string;
  status?: string;
  limit?: number;
}

/** Persistence for CRM accounts. Postgres in production; in-memory stand-in for no-DB boots. */
export interface AccountStore {
  create(account: Account): Promise<void>;
  /** Insert on a caller-owned transaction (atomic with its event); null tx falls back to create. */
  createWithClient(tx: TxHandle | null, account: Account): Promise<void>;
  get(id: Id): Promise<Account | null>;
  list(filter?: AccountFilter): Promise<Account[]>;
}
