import type { Id } from '@aura/shared';
import type { Account } from './domain/account';

export const ACCOUNT_STORE = Symbol('ACCOUNT_STORE');

export interface AccountFilter {
  tenantId?: string;
  type?: string;
}

export interface AccountStore {
  create(account: Account): Promise<void>;
  get(id: Id): Promise<Account | null>;
  getByCode(tenantId: Id, code: string): Promise<Account | null>;
  list(filter?: AccountFilter): Promise<Account[]>;
}
