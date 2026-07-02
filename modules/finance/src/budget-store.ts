import type { Id, Page, PageParams } from '@aura/shared';
import type { Budget } from './domain/budget';

export const BUDGET_STORE = Symbol('BUDGET_STORE');

export interface BudgetStore {
  save(budget: Budget): Promise<void>;
  get(id: Id): Promise<Budget | null>;
  list(tenantId: string): Promise<Budget[]>;
  listPaged(tenantId: string, page: PageParams): Promise<Page<Budget>>;
  remove(id: Id): Promise<void>;
}
