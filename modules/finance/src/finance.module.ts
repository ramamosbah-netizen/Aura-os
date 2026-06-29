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
    InvoiceService,
    AccountService,
    JournalService,
    PaymentService,
    BankReconciliationService,
    TaxService,
  ],
  exports: [InvoiceService, AccountService, JournalService, PaymentService, BankReconciliationService, TaxService],
})
export class FinanceModule implements OnModuleInit {
  constructor(private readonly projectionEngine: ProjectionEngine) {}

  onModuleInit() {
    this.projectionEngine.register(new ProfitLossProjection());
  }
}
