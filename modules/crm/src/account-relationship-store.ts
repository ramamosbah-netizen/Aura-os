import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { AccountRelationship } from './domain/account-relationship';

/** DI token for the CRM account relationship store. */
export const CRM_ACCOUNT_RELATIONSHIP_STORE = Symbol('CRM_ACCOUNT_RELATIONSHIP_STORE');

/** Persistence for the account relationship graph (typed directed edges). */
export interface AccountRelationshipStore {
  create(rel: AccountRelationship): Promise<void>;
  /** Insert on a caller-owned transaction (atomic with its event); null tx falls back to create. */
  createWithClient(tx: TxHandle | null, rel: AccountRelationship): Promise<void>;
  get(id: Id): Promise<AccountRelationship | null>;
  delete(id: Id): Promise<void>;
  /** Delete on a caller-owned transaction (atomic with its event); null tx falls back to delete. */
  deleteWithClient(tx: TxHandle | null, id: Id): Promise<void>;
  /** Every edge touching the account — either direction, tenant-scoped. */
  listFor(tenantId: Id, accountId: Id): Promise<AccountRelationship[]>;
  /** The exact edge, if already recorded (the duplicate guard reads before the unique index refuses). */
  find(tenantId: Id, fromAccountId: Id, toAccountId: Id, type: string): Promise<AccountRelationship | null>;
}
