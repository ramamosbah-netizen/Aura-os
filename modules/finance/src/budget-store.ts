import type { Id, Page, PageParams } from '@aura/shared';
import type { Budget } from './domain/budget';

export const BUDGET_STORE = Symbol('BUDGET_STORE');

export interface BudgetStore {
  save(budget: Budget): Promise<void>;
  get(id: Id): Promise<Budget | null>;
  list(tenantId: string): Promise<Budget[]>;
  listPaged(tenantId: string, page: PageParams): Promise<Page<Budget>>;
  /** Soft-delete flag: true hides the budget from finds; false restores. Tenant-scoped so a
   *  restore (which cannot re-fetch the hidden row to check ownership) can only touch the
   *  caller's own budget. */
  setDeleted(tenantId: Id, id: Id, deleted: boolean): Promise<void>;
}
