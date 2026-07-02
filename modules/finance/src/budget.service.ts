import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type Page, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { type Budget, type BudgetVsActual, type NewBudget, buildBudgetVsActual, makeBudget } from './domain/budget';
import { BUDGET_STORE, type BudgetStore } from './budget-store';
import { ACCOUNT_STORE, type AccountStore } from './account-store';
import { JOURNAL_STORE, type JournalStore } from './journal-store';

/**
 * Budget service. Owns budgets; computes budget-vs-actual by folding the live GL for the
 * budget's date range (actuals are never stored — always reconciled to the books).
 */
@Injectable()
export class BudgetService {
  private readonly logger = new Logger('FinanceBudget');

  constructor(
    @Inject(BUDGET_STORE) private readonly store: BudgetStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(JOURNAL_STORE) private readonly journals: JournalStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewBudget): Promise<Budget> {
    const budget = makeBudget(input);
    await this.store.save(budget);
    await this.events.append([
      makeEvent({
        type: 'finance.budget.created',
        tenantId: budget.tenantId,
        companyId: null,
        actorId: budget.createdBy,
        aggregateType: 'finance.budget',
        aggregateId: budget.id,
        payload: { name: budget.name, from: budget.from, to: budget.to, lineCount: budget.lines.length },
      }),
    ]);
    this.logger.log(`Budget created: ${budget.name} (${budget.id}) ${budget.from}..${budget.to}`);
    return budget;
  }

  get(id: Id): Promise<Budget | null> {
    return this.store.get(id);
  }

  list(tenantId: Id): Promise<Budget[]> {
    return this.store.list(tenantId);
  }

  listPaged(tenantId: Id, page: PageParams): Promise<Page<Budget>> {
    return this.store.listPaged(tenantId, page);
  }

  async remove(id: Id): Promise<void> {
    await this.store.remove(id);
  }

  /** Budget-vs-actual for a budget, folding the GL over its date range. */
  async vsActual(id: Id): Promise<BudgetVsActual | null> {
    const budget = await this.store.get(id);
    if (!budget) return null;
    const [accounts, journals] = await Promise.all([
      this.accounts.list({ tenantId: budget.tenantId }),
      this.journals.list({ tenantId: budget.tenantId, limit: 1_000_000 }),
    ]);
    return buildBudgetVsActual(budget, accounts, journals);
  }
}
