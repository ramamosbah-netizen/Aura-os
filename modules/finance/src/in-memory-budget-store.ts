import type { Id } from '@aura/shared';
import type { Budget } from './domain/budget';
import type { BudgetStore } from './budget-store';

export class InMemoryBudgetStore implements BudgetStore {
  private readonly budgets = new Map<string, Budget>();

  async save(budget: Budget): Promise<void> {
    this.budgets.set(budget.id, { ...budget, lines: budget.lines.map((l) => ({ ...l })) });
  }

  async get(id: Id): Promise<Budget | null> {
    const b = this.budgets.get(id);
    return b ? { ...b, lines: b.lines.map((l) => ({ ...l })) } : null;
  }

  async list(tenantId: string): Promise<Budget[]> {
    return [...this.budgets.values()]
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async remove(id: Id): Promise<void> {
    this.budgets.delete(id);
  }
}
