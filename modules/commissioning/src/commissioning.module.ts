import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { CommissioningService } from './commissioning.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';
import { PostgresCommissioningStore } from './postgres-commissioning-store';
import { COMMISSIONING_STORE } from './store.interface';

/**
 * Commissioning (T&C) business module. Postgres when a pool is configured, in-memory
 * otherwise — the same DI-swap discipline as every other module.
 */
@Module({
  imports: [CoreModule],
  providers: [
    CommissioningService,
    {
      provide: COMMISSIONING_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCommissioningStore(pool) : new InMemoryCommissioningStore(),
    },
  ],
  exports: [CommissioningService],
})
export class CommissioningModule {}
