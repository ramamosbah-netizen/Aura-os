import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { PURCHASE_ORDER_STORE } from './purchase-order-store';
import { InMemoryPurchaseOrderStore } from './in-memory-purchase-order-store';
import { PostgresPurchaseOrderStore } from './postgres-purchase-order-store';
import { PurchaseOrderService } from './purchase-order.service';

import { PURCHASE_REQUEST_STORE } from './purchase-request-store';
import { InMemoryPurchaseRequestStore } from './in-memory-purchase-request-store';
import { PostgresPurchaseRequestStore } from './postgres-purchase-request-store';
import { PurchaseRequestService } from './purchase-request.service';

/** The Procurement business module — same shape as the deal-chain modules. */
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: PURCHASE_ORDER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPurchaseOrderStore(pool) : new InMemoryPurchaseOrderStore(),
    },
    {
      provide: PURCHASE_REQUEST_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPurchaseRequestStore(pool) : new InMemoryPurchaseRequestStore(),
    },
    PurchaseOrderService,
    PurchaseRequestService,
  ],
  exports: [PurchaseOrderService, PurchaseRequestService],
})
export class ProcurementModule {}
