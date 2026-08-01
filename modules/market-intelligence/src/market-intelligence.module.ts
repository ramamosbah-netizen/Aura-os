import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { MarketItemService } from './market-item.service';
import { InMemoryMarketItemStore } from './in-memory-market-item-store';
import { PostgresMarketItemStore } from './postgres-market-item-store';
import { MARKET_ITEM_STORE } from './market-item-store';

/**
 * Market Intelligence — the reference catalogue behind pricing, as its OWN bounded context rather
 * than a corner of CRM. It is master data consumed across the platform (CRM quoting, Tendering
 * estimation, Procurement, Inventory, Projects, Finance and the AI layer), so it must not belong
 * to any single one of them. Same DI-swap discipline as every module: Postgres when a pool is
 * configured, in-memory otherwise.
 */
@Module({
  imports: [CoreModule],
  providers: [
    MarketItemService,
    {
      provide: MARKET_ITEM_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresMarketItemStore(pool) : new InMemoryMarketItemStore(),
    },
  ],
  exports: [MarketItemService],
})
export class MarketIntelligenceModule {}
