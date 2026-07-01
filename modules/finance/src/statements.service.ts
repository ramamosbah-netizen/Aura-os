import { Inject, Injectable } from '@nestjs/common';
import type { Id } from '@aura/shared';
import { ACCOUNT_STORE, type AccountStore } from './account-store';
import { JOURNAL_STORE, type JournalStore } from './journal-store';
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

  private async load(tenantId: Id) {
    const [accounts, journals] = await Promise.all([
      this.accounts.list({ tenantId }),
      this.journals.list({ tenantId, limit: 1_000_000 }),
    ]);
    return { accounts, journals };
  }

  async trialBalance(tenantId: Id, asOf?: string | null): Promise<TrialBalance> {
    const { accounts, journals } = await this.load(tenantId);
    return buildTrialBalance(accounts, journals, asOf);
  }

  async incomeStatement(tenantId: Id, from?: string | null, to?: string | null): Promise<IncomeStatement> {
    const { accounts, journals } = await this.load(tenantId);
    return buildIncomeStatement(accounts, journals, from, to);
  }

  async balanceSheet(tenantId: Id, asOf?: string | null): Promise<BalanceSheet> {
    const { accounts, journals } = await this.load(tenantId);
    return buildBalanceSheet(accounts, journals, asOf);
  }

  async cashFlow(tenantId: Id, from?: string | null, to?: string | null): Promise<CashFlow> {
    const { accounts, journals } = await this.load(tenantId);
    return buildCashFlow(accounts, journals, from, to);
  }

  /**
   * Group consolidation: per-company income statement + balance sheet, plus a consolidated
   * (whole-tenant) set. Journals tagged with a companyId roll into that company; the
   * consolidated column is every journal (the group). `asOf` bounds the balance sheet.
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

    return {
      asOf: asOf ?? null,
      companies,
      consolidated: {
        incomeStatement: buildIncomeStatement(accounts, journals, null, asOf),
        balanceSheet: buildBalanceSheet(accounts, journals, asOf),
      },
    };
  }
}

export interface ConsolidatedCompany {
  companyId: string;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
}

export interface ConsolidatedStatements {
  asOf: string | null;
  companies: ConsolidatedCompany[];
  consolidated: { incomeStatement: IncomeStatement; balanceSheet: BalanceSheet };
}
