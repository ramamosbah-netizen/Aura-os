import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { AmcService } from './amc.service';
import { InMemoryAmcStore } from './in-memory-amc-store';
import { PostgresAmcStore } from './postgres-amc-store';
import { AMC_STORE } from './store.interface';

/**
 * AMC business module. Now follows the same DI-swap discipline as every other module:
 * Postgres when a pool is configured, in-memory (seeded demo data) otherwise — so AMC
 * finally persists instead of losing all service data on restart.
 */
@Module({
  imports: [CoreModule],
  providers: [
    AmcService,
    {
      provide: AMC_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresAmcStore(pool) : new InMemoryAmcStore(),
    },
  ],
  exports: [AmcService],
})
export class AmcModule {}
