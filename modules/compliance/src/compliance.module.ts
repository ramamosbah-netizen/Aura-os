import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { ComplianceService } from './compliance.service';
import { InMemoryComplianceStore } from './in-memory-compliance-store';
import { PostgresComplianceStore } from './postgres-compliance-store';
import { COMPLIANCE_STORE } from './store.interface';

/**
 * Compliance Core (ADR-0018). Postgres when a pool is configured, in-memory otherwise — the same
 * DI-swap discipline as every other module.
 *
 * Ships with zero seeded rules: no authority, obligation, fee or validity period is written at
 * boot. Authorities are registered by hand until the regulatory requirements are sourced.
 */
@Module({
  imports: [CoreModule],
  providers: [
    ComplianceService,
    {
      provide: COMPLIANCE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresComplianceStore(pool) : new InMemoryComplianceStore(),
    },
  ],
  exports: [ComplianceService],
})
export class ComplianceModule {}
