import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { Budget } from './domain/budget';
import type { BudgetStore } from './budget-store';

export class InMemoryBudgetStore implements BudgetStore {
  private readonly budgets = new Map<string, Budget>();

  async save(budget: Budget): Promise<void> {
    this.budgets.set(budget.id, { ...budget, lines: budget.lines.map((l) => ({ ...l })) });
  }

  async get(id: Id): Promise<Budget | null> {
    const b = this.budgets.get(id);
    if (!b || b.deletedAt) return null;
    return { ...b, lines: b.lines.map((l) => ({ ...l })) };
  }

  async list(tenantId: string): Promise<Budget[]> {
    return [...this.budgets.values()]
      .filter((b) => b.tenantId === tenantId && !b.deletedAt)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listPaged(tenantId: string, page: PageParams): Promise<Page<Budget>> {
    return paginate(await this.list(tenantId), page);
  }

  async setDeleted(id: Id, deleted: boolean): Promise<void> {
    const b = this.budgets.get(id);
    if (b) b.deletedAt = deleted ? new Date().toISOString() : null;
  }
}
