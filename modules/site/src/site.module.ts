import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  DAILY_REPORT_STORE,
  DELAY_LOG_STORE,
  MATERIAL_CONSUMPTION_STORE,
  SITE_INSTRUCTION_STORE,
  LABOUR_ALLOCATION_STORE,
  PLANT_USAGE_STORE,
  INSTALLATION_STORE,
  SITE_REPORT_LABOUR_STORE,
  SITE_REPORT_PLANT_STORE,
  SITE_REPORT_PROGRESS_STORE,
  SITE_REPORT_DELAY_STORE,
  SITE_REPORT_EVIDENCE_STORE,
  SiteService,
} from './site.service';
import { InMemoryReportLineStore } from './in-memory-report-lines-store';
import { makePostgresLabourStore, makePostgresPlantStore, makePostgresProgressStore, makePostgresDelayStore, makePostgresEvidenceStore } from './postgres-report-lines-store';

import {
  InMemoryDailyReportStore,
  InMemoryDelayLogStore,
  InMemoryMaterialConsumptionStore,
  InMemorySiteInstructionStore,
  InMemoryLabourAllocationStore,
  InMemoryPlantUsageStore,
  InMemoryInstallationStore,
} from './in-memory-site-store';

import {
  PostgresDailyReportStore,
  PostgresDelayLogStore,
  PostgresMaterialConsumptionStore,
  PostgresSiteInstructionStore,
  PostgresLabourAllocationStore,
  PostgresPlantUsageStore,
  PostgresInstallationStore,
} from './postgres-site-store';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: DAILY_REPORT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresDailyReportStore(pool) : new InMemoryDailyReportStore(),
    },
    {
      provide: DELAY_LOG_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresDelayLogStore(pool) : new InMemoryDelayLogStore(),
    },
    {
      provide: MATERIAL_CONSUMPTION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresMaterialConsumptionStore(pool) : new InMemoryMaterialConsumptionStore(),
    },
    {
      provide: SITE_INSTRUCTION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSiteInstructionStore(pool) : new InMemorySiteInstructionStore(),
    },
    {
      provide: LABOUR_ALLOCATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresLabourAllocationStore(pool) : new InMemoryLabourAllocationStore(),
    },
    {
      provide: PLANT_USAGE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPlantUsageStore(pool) : new InMemoryPlantUsageStore(),
    },
    {
      provide: INSTALLATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresInstallationStore(pool) : new InMemoryInstallationStore(),
    },
    {
      provide: SITE_REPORT_LABOUR_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) => (pool ? makePostgresLabourStore(pool) : new InMemoryReportLineStore()),
    },
    {
      provide: SITE_REPORT_PLANT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) => (pool ? makePostgresPlantStore(pool) : new InMemoryReportLineStore()),
    },
    {
      provide: SITE_REPORT_PROGRESS_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) => (pool ? makePostgresProgressStore(pool) : new InMemoryReportLineStore()),
    },
    {
      provide: SITE_REPORT_DELAY_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) => (pool ? makePostgresDelayStore(pool) : new InMemoryReportLineStore()),
    },
    {
      provide: SITE_REPORT_EVIDENCE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) => (pool ? makePostgresEvidenceStore(pool) : new InMemoryReportLineStore()),
    },
    SiteService,
  ],
  exports: [SiteService],
})
export class SiteModule {}
