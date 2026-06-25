import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { GOODS_RECEIPT_STORE } from './goods-receipt-store';
import { InMemoryGoodsReceiptStore } from './in-memory-goods-receipt-store';
import { PostgresGoodsReceiptStore } from './postgres-goods-receipt-store';
import { GoodsReceiptService } from './goods-receipt.service';

/** The Inventory business module — same shape as Procurement / the deal-chain modules. */
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: GOODS_RECEIPT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresGoodsReceiptStore(pool) : new InMemoryGoodsReceiptStore(),
    },
    GoodsReceiptService,
  ],
  exports: [GoodsReceiptService],
})
export class InventoryModule {}
