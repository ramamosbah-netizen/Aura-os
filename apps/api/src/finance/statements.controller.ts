import { Controller, Get, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type BalanceSheet,
  type CashFlow,
  type IncomeStatement,
  type TrialBalance,
  type ConsolidatedStatements,
  StatementsService,
} from '@aura/finance';

/**
 * Financial statements — read-only, GL-derived (trial balance + the three primary
 * statements). All scoped to the request tenant. Query params:
 *   trial-balance / balance-sheet : ?asOf=YYYY-MM-DD
 *   income-statement / cash-flow  : ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
@Controller('finance/statements')
export class StatementsController {
  constructor(
    private readonly statements: StatementsService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('trial-balance')
  trialBalance(@Query('asOf') asOf?: string): Promise<TrialBalance> {
    return this.statements.trialBalance(this.tenant.get().tenantId, asOf || null);
  }

  @Get('income-statement')
  incomeStatement(@Query('from') from?: string, @Query('to') to?: string): Promise<IncomeStatement> {
    return this.statements.incomeStatement(this.tenant.get().tenantId, from || null, to || null);
  }

  @Get('balance-sheet')
  balanceSheet(@Query('asOf') asOf?: string): Promise<BalanceSheet> {
    return this.statements.balanceSheet(this.tenant.get().tenantId, asOf || null);
  }

  @Get('cash-flow')
  cashFlow(@Query('from') from?: string, @Query('to') to?: string): Promise<CashFlow> {
    return this.statements.cashFlow(this.tenant.get().tenantId, from || null, to || null);
  }

  @Get('consolidated')
  consolidated(@Query('asOf') asOf?: string): Promise<ConsolidatedStatements> {
    return this.statements.consolidated(this.tenant.get().tenantId, asOf || null);
  }
}
