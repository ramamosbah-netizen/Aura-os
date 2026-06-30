import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { PROJECT_STORE } from './project-store';
import { InMemoryProjectStore } from './in-memory-project-store';
import { PostgresProjectStore } from './postgres-project-store';
import { ProjectService } from './project.service';

import { WBS_STORE } from './wbs-store';
import { InMemoryWbsStore } from './in-memory-wbs-store';
import { PostgresWbsStore } from './postgres-wbs-store';
import { WbsService } from './wbs.service';

import { CBS_STORE } from './cbs-store';
import { InMemoryCbsStore } from './in-memory-cbs-store';
import { PostgresCbsStore } from './postgres-cbs-store';
import { CbsService } from './cbs.service';

import { DELAY_STORE, EOT_STORE } from './delay-eot-store';
import { InMemoryDelayStore, InMemoryEotStore } from './in-memory-delay-eot-store';
import { PostgresDelayStore, PostgresEotStore } from './postgres-delay-eot-store';
import { DelayEotService } from './delay-eot.service';

import { VARIATION_STORE } from './variation-store';
import { InMemoryVariationStore } from './in-memory-variation-store';
import { PostgresVariationStore } from './postgres-variation-store';
import { VariationService } from './variation.service';

import { CLOSEOUT_STORE } from './closeout-store';
import { InMemoryCloseoutStore } from './in-memory-closeout-store';
import { PostgresCloseoutStore } from './postgres-closeout-store';
import { CloseoutService } from './closeout.service';

import { CASHFLOW_FORECAST_STORE } from './cashflow-forecast-store';
import { InMemoryCashflowForecastStore } from './in-memory-cashflow-forecast-store';
import { PostgresCashflowForecastStore } from './postgres-cashflow-forecast-store';
import { CashflowForecastService } from './cashflow-forecast.service';

/** The Projects business module — same shape as the rest of the deal chain (the template). */
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: PROJECT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresProjectStore(pool) : new InMemoryProjectStore(),
    },
    {
      provide: WBS_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresWbsStore(pool) : new InMemoryWbsStore(),
    },
    {
      provide: CBS_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCbsStore(pool) : new InMemoryCbsStore(),
    },
    {
      provide: DELAY_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresDelayStore(pool) : new InMemoryDelayStore(),
    },
    {
      provide: EOT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresEotStore(pool) : new InMemoryEotStore(),
    },
    {
      provide: VARIATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresVariationStore(pool) : new InMemoryVariationStore(),
    },
    {
      provide: CLOSEOUT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCloseoutStore(pool) : new InMemoryCloseoutStore(),
    },
    {
      provide: CASHFLOW_FORECAST_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCashflowForecastStore(pool) : new InMemoryCashflowForecastStore(),
    },
    ProjectService,
    WbsService,
    CbsService,
    DelayEotService,
    VariationService,
    CloseoutService,
    CashflowForecastService,
  ],
  exports: [ProjectService, WbsService, CbsService, DelayEotService, VariationService, CloseoutService, CashflowForecastService],
})
export class ProjectsModule {}
