import { Inject, Injectable } from '@nestjs/common';
import type { Id } from '@aura/shared';
import { ACCOUNT_STORE, type AccountStore } from './account-store';
import { JOURNAL_STORE, type JournalStore } from './journal-store';
import { buildEliminations, eliminationTotal } from './domain/journal';
import {
  type BalanceSheet,
  type CashFlow,
  type IncomeStatement,
  type TrialBalance,
  buildBalanceSheet,
  buildCashFlow,
  buildIncomeStatement,
  buildTrialBalance,
} from './domain/statements';

/**
 * Financial-statements read service. Loads the chart of accounts + the full journal
 * ledger for a tenant and folds the four GL-derived statements. Read-only; the GL stays
 * the single source of truth.
 */
@Injectable()
export class StatementsService {
  constructor(
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(JOURNAL_STORE) private readonly journals: JournalStore,
  ) {}

  /**
   * Load the chart of accounts and the journals a statement folds over.
   *
   * `companyId` scopes the journals to ONE company in the group. The statements used to be
   * tenant-wide with no company filter at all, even though every journal carries a companyId and
   * the platform models a multi-company group (that is what `consolidated()` below exists for). A
   * user signed into Company A therefore saw a balance sheet containing Company B's assets — the
   * group's numbers mixed into a single entity's accounts, which is both wrong and a disclosure
   * inside the group.
   *
   * A null companyId keeps the whole-tenant view, which is what a group-level user should get and
   * what `consolidated()` needs.
   *
   * The chart of accounts stays tenant-wide: it is shared, and an account with no movement in a
   * company simply contributes nothing.
   */
  private async load(tenantId: Id, companyId?: Id | null) {
    const [accounts, journals] = await Promise.all([
      this.accounts.list({ tenantId }),
      this.journals.list({ tenantId, limit: 1_000_000 }),
    ]);
    return { accounts, journals: companyId ? journals.filter((j) => j.companyId === companyId) : journals };
  }

  async trialBalance(tenantId: Id, asOf?: string | null, companyId?: Id | null): Promise<TrialBalance> {
    const { accounts, journals } = await this.load(tenantId, companyId);
    return buildTrialBalance(accounts, journals, asOf);
  }

  async incomeStatement(tenantId: Id, from?: string | null, to?: string | null, companyId?: Id | null): Promise<IncomeStatement> {
    const { accounts, journals } = await this.load(tenantId, companyId);
    return buildIncomeStatement(accounts, journals, from, to);
  }

  async balanceSheet(tenantId: Id, asOf?: string | null, companyId?: Id | null): Promise<BalanceSheet> {
    const { accounts, journals } = await this.load(tenantId, companyId);
    return buildBalanceSheet(accounts, journals, asOf);
  }

  async cashFlow(tenantId: Id, from?: string | null, to?: string | null, companyId?: Id | null): Promise<CashFlow> {
    const { accounts, journals } = await this.load(tenantId, companyId);
    return buildCashFlow(accounts, journals, from, to);
  }

  /**
   * Group consolidation: per-company income statement + balance sheet, plus a consolidated
   * (whole-group) set with **intercompany eliminations**. Journals tagged with a companyId roll
   * into that company; the consolidated column is every journal PLUS reversing entries for
   * intercompany-tagged journals, so intra-group revenue/expense and receivables/payables net to
   * zero (true consolidation, not a naive sum). `asOf` bounds the balance sheet.
   */
  async consolidated(tenantId: Id, asOf?: string | null): Promise<ConsolidatedStatements> {
    const { accounts, journals } = await this.load(tenantId);
    const companyIds = [...new Set(journals.map((j) => j.companyId).filter((c): c is string => !!c))].sort();

    const companies: ConsolidatedCompany[] = companyIds.map((companyId) => {
      const cj = journals.filter((j) => j.companyId === companyId);
      return {
        companyId,
        incomeStatement: buildIncomeStatement(accounts, cj, null, asOf),
        balanceSheet: buildBalanceSheet(accounts, cj, asOf),
      };
    });

    const eliminations = buildEliminations(journals);
    const groupBefore = buildIncomeStatement(accounts, journals, null, asOf);
    const consolidatedJournals = [...journals, ...eliminations];

    return {
      asOf: asOf ?? null,
      companies,
      eliminations: {
        entries: eliminations.length,
        amount: Math.round(eliminationTotal(journals) * 100) / 100,
        // group revenue before vs after removing intra-group transactions
        revenueBeforeElimination: groupBefore.totalRevenue,
        revenueAfterElimination: buildIncomeStatement(accounts, consolidatedJournals, null, asOf).totalRevenue,
      },
      consolidated: {
        incomeStatement: buildIncomeStatement(accounts, consolidatedJournals, null, asOf),
        balanceSheet: buildBalanceSheet(accounts, consolidatedJournals, asOf),
      },
    };
  }
}

export interface ConsolidatedCompany {
  companyId: string;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
}

export interface ConsolidatedEliminations {
  entries: number;
  amount: number;
  revenueBeforeElimination: number;
  revenueAfterElimination: number;
}

export interface ConsolidatedStatements {
  asOf: string | null;
  companies: ConsolidatedCompany[];
  eliminations: ConsolidatedEliminations;
  consolidated: { incomeStatement: IncomeStatement; balanceSheet: BalanceSheet };
}
