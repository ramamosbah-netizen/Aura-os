import { Module, OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL, ProjectionEngine } from '@aura/core';
import { INVOICE_STORE } from './invoice-store';
import { InMemoryInvoiceStore } from './in-memory-invoice-store';
import { PostgresInvoiceStore } from './postgres-invoice-store';
import { InvoiceService } from './invoice.service';

import { ACCOUNT_STORE } from './account-store';
import { InMemoryAccountStore } from './in-memory-account-store';
import { PostgresAccountStore } from './postgres-account-store';
import { AccountService } from './account.service';

import { JOURNAL_STORE } from './journal-store';
import { InMemoryJournalStore } from './in-memory-journal-store';
import { PostgresJournalStore } from './postgres-journal-store';
import { JournalService } from './journal.service';

import { PAYMENT_STORE } from './payment-store';
import { InMemoryPaymentStore } from './in-memory-payment-store';
import { PostgresPaymentStore } from './postgres-payment-store';
import { PaymentService } from './payment.service';

import { BANK_TRANSACTION_STORE } from './bank-transaction-store';
import { InMemoryBankTransactionStore } from './in-memory-bank-transaction-store';
import { PostgresBankTransactionStore } from './postgres-bank-transaction-store';
import { BankReconciliationService } from './bank-reconciliation.service';

import { TAX_CODE_STORE, TAX_LINE_STORE, TAX_RETURN_STORE } from './tax-store';
import { InMemoryTaxCodeStore, InMemoryTaxLineStore, InMemoryTaxReturnStore } from './in-memory-tax-store';
import { PostgresTaxCodeStore, PostgresTaxLineStore, PostgresTaxReturnStore } from './postgres-tax-store';
import { TaxService } from './tax.service';

import { PETTY_CASH_STORE } from './petty-cash-store';
import { InMemoryPettyCashStore } from './in-memory-petty-cash-store';
import { PostgresPettyCashStore } from './postgres-petty-cash-store';
import { PettyCashService } from './petty-cash.service';

import { CUSTOMER_INVOICE_STORE } from './customer-invoice-store';
import { InMemoryCustomerInvoiceStore } from './in-memory-customer-invoice-store';
import { PostgresCustomerInvoiceStore } from './postgres-customer-invoice-store';
import { CustomerInvoiceService } from './customer-invoice.service';

import { BANK_GUARANTEE_STORE } from './bank-guarantee-store';
import { InMemoryBankGuaranteeStore } from './in-memory-bank-guarantee-store';
import { PostgresBankGuaranteeStore } from './postgres-bank-guarantee-store';
import { BankGuaranteeService } from './bank-guarantee.service';

import { POST_DATED_CHEQUE_STORE } from './post-dated-cheque-store';
import { InMemoryPostDatedChequeStore } from './in-memory-post-dated-cheque-store';
import { PostgresPostDatedChequeStore } from './postgres-post-dated-cheque-store';
import { PostDatedChequeService } from './post-dated-cheque.service';

import { PERIOD_CLOSE_STORE } from './period-close-store';
import { InMemoryPeriodCloseStore } from './in-memory-period-close-store';
import { PostgresPeriodCloseStore } from './postgres-period-close-store';
import { PeriodCloseService } from './period-close.service';

import { BUDGET_STORE } from './budget-store';
import { InMemoryBudgetStore } from './in-memory-budget-store';
import { PostgresBudgetStore } from './postgres-budget-store';
import { BudgetService } from './budget.service';

import { StatementsService } from './statements.service';

import { COST_CENTER_STORE } from './cost-center-store';
import { InMemoryCostCenterStore } from './in-memory-cost-center-store';
import { PostgresCostCenterStore } from './postgres-cost-center-store';
import { CostCenterService } from './cost-center.service';

import { PROFIT_CENTER_STORE } from './profit-center-store';
import { InMemoryProfitCenterStore } from './in-memory-profit-center-store';
import { PostgresProfitCenterStore } from './postgres-profit-center-store';
import { ProfitCenterService } from './profit-center.service';

import { ProcurementModule } from '@aura/procurement';
import { InventoryModule } from '@aura/inventory';
import { ProfitLossProjection } from './projections/profit-loss.projection';

/** The Finance business module — same shape as Procurement / Inventory / the deal chain. */
@Module({
  imports: [CoreModule, ProcurementModule, InventoryModule],
  providers: [
    {
      provide: INVOICE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresInvoiceStore(pool) : new InMemoryInvoiceStore(),
    },
    {
      provide: ACCOUNT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresAccountStore(pool) : new InMemoryAccountStore(),
    },
    {
      provide: JOURNAL_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresJournalStore(pool) : new InMemoryJournalStore(),
    },
    {
      provide: PAYMENT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPaymentStore(pool) : new InMemoryPaymentStore(),
    },
    {
      provide: BANK_TRANSACTION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresBankTransactionStore(pool) : new InMemoryBankTransactionStore(),
    },
    {
      provide: TAX_CODE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTaxCodeStore(pool) : new InMemoryTaxCodeStore(),
    },
    {
      provide: TAX_RETURN_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTaxReturnStore(pool) : new InMemoryTaxReturnStore(),
    },
    {
      provide: TAX_LINE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTaxLineStore(pool) : new InMemoryTaxLineStore(),
    },
    {
      provide: PETTY_CASH_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPettyCashStore(pool) : new InMemoryPettyCashStore(),
    },
    {
      provide: CUSTOMER_INVOICE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCustomerInvoiceStore(pool) : new InMemoryCustomerInvoiceStore(),
    },
    {
      provide: BANK_GUARANTEE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresBankGuaranteeStore(pool) : new InMemoryBankGuaranteeStore(),
    },
    {
      provide: POST_DATED_CHEQUE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPostDatedChequeStore(pool) : new InMemoryPostDatedChequeStore(),
    },
    {
      provide: PERIOD_CLOSE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPeriodCloseStore(pool) : new InMemoryPeriodCloseStore(),
    },
    {
      provide: BUDGET_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresBudgetStore(pool) : new InMemoryBudgetStore(),
    },
    InvoiceService,
    AccountService,
    JournalService,
    PaymentService,
    BankReconciliationService,
    TaxService,
    PettyCashService,
    CustomerInvoiceService,
    BankGuaranteeService,
    PostDatedChequeService,
    StatementsService,
    PeriodCloseService,
    BudgetService,
    {
      provide: COST_CENTER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCostCenterStore(pool) : new InMemoryCostCenterStore(),
    },
    CostCenterService,
    {
      provide: PROFIT_CENTER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresProfitCenterStore(pool) : new InMemoryProfitCenterStore(),
    },
    ProfitCenterService,
  ],
  exports: [InvoiceService, AccountService, JournalService, PaymentService, BankReconciliationService, TaxService, PettyCashService, CustomerInvoiceService, BankGuaranteeService, PostDatedChequeService, StatementsService, PeriodCloseService, BudgetService, CostCenterService, ProfitCenterService],
})
export class FinanceModule implements OnModuleInit {
  constructor(private readonly projectionEngine: ProjectionEngine) {}

  onModuleInit() {
    this.projectionEngine.register(new ProfitLossProjection());
  }
}
