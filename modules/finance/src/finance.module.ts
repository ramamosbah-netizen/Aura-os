import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { INVOICE_STORE } from './invoice-store';
import { InMemoryInvoiceStore } from './in-memory-invoice-store';
import { PostgresInvoiceStore } from './postgres-invoice-store';
import { InvoiceService } from './invoice.service';

/** The Finance business module — same shape as Procurement / Inventory / the deal chain. */
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: INVOICE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresInvoiceStore(pool) : new InMemoryInvoiceStore(),
    },
    InvoiceService,
  ],
  exports: [InvoiceService],
})
export class FinanceModule {}
