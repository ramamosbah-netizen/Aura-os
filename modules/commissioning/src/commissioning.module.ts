import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { CommissioningService } from './commissioning.service';
import { HandoverService } from './handover.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';
import { PostgresCommissioningStore } from './postgres-commissioning-store';
import { COMMISSIONING_STORE } from './store.interface';
import { CommissioningProjectResolvers } from './project-resolvers';

/**
 * Commissioning (T&C) business module. Postgres when a pool is configured, in-memory
 * otherwise — the same DI-swap discipline as every other module.
 */
@Module({
  imports: [CoreModule],
  providers: [
    // Tells the permission guard which project each record belongs to, so entity-addressed
    // routes can be authorised by a project-scoped grant. See project-resolvers.ts.
    CommissioningProjectResolvers,
    CommissioningService,
    HandoverService,
    {
      provide: COMMISSIONING_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCommissioningStore(pool) : new InMemoryCommissioningStore(),
    },
  ],
  exports: [CommissioningService, HandoverService],
})
export class CommissioningModule {}
