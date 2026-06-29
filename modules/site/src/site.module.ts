import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  DAILY_REPORT_STORE,
  DELAY_LOG_STORE,
  MATERIAL_CONSUMPTION_STORE,
  SiteService,
} from './site.service';

import {
  InMemoryDailyReportStore,
  InMemoryDelayLogStore,
  InMemoryMaterialConsumptionStore,
} from './in-memory-site-store';

import {
  PostgresDailyReportStore,
  PostgresDelayLogStore,
  PostgresMaterialConsumptionStore,
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
    SiteService,
  ],
  exports: [SiteService],
})
export class SiteModule {}
