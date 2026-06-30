import type { Id } from '@aura/shared';
import type { Budget } from './domain/budget';

export const BUDGET_STORE = Symbol('BUDGET_STORE');

export interface BudgetStore {
  save(budget: Budget): Promise<void>;
  get(id: Id): Promise<Budget | null>;
  list(tenantId: string): Promise<Budget[]>;
  remove(id: Id): Promise<void>;
}
