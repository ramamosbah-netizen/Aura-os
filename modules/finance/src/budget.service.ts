import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Id, type Page, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { type Budget, type BudgetVsActual, type NewBudget, buildBudgetVsActual, makeBudget } from './domain/budget';
import { BUDGET_STORE, type BudgetStore } from './budget-store';
import { ACCOUNT_STORE, type AccountStore } from './account-store';
import { JOURNAL_STORE, type JournalStore } from './journal-store';
import { assertSameTenant, sameTenantOrNull } from './domain/tenant-guard';

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
    // Explicit @Inject: a union-typed ctor param emits `Object` and silently injects null.
    // Optional so in-memory tests need no request context.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
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

  async get(id: Id): Promise<Budget | null> {
    // Tenant-scoped read (G-03): never hand back another tenant's budget.
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(tenantId: Id): Promise<Budget[]> {
    return this.store.list(tenantId);
  }

  listPaged(tenantId: Id, page: PageParams): Promise<Page<Budget>> {
    return this.store.listPaged(tenantId, page);
  }

  /** Soft-delete (audit-safe); restorable via restore(). */
  async remove(id: Id): Promise<void> {
    // Assert ownership on the live row first — a foreign or missing budget is "not found",
    // never a cross-tenant delete. The store call is tenant-scoped too (belt and suspenders).
    const budget = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'budget', id);
    await this.store.setDeleted(budget.tenantId, id, true);
  }

  /** Undo a soft-delete. The row is hidden from get() while deleted, so we cannot re-fetch it to
   *  check ownership; instead the store scopes the update by the caller's tenant — a cross-tenant
   *  restore touches no rows (fail-closed). */
  async restore(id: Id): Promise<void> {
    await this.store.setDeleted(this.tenant?.boundTenantId() ?? '', id, false);
  }

  /** Budget-vs-actual for a budget, folding the GL over its date range. */
  async vsActual(id: Id): Promise<BudgetVsActual | null> {
    // Tenant-scoped (G-03): a wrong-tenant id must not expose another tenant's budget OR the GL
    // actuals folded for it. Treated as absent → null.
    const budget = sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
    if (!budget) return null;
    const [accounts, journals] = await Promise.all([
      this.accounts.list({ tenantId: budget.tenantId }),
      this.journals.list({ tenantId: budget.tenantId, limit: 1_000_000 }),
    ]);
    return buildBudgetVsActual(budget, accounts, journals);
  }
}
