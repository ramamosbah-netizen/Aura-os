import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  NCR_STORE,
  INSPECTION_REQUEST_STORE,
  SNAG_STORE,
  QualityService,
} from './quality.service';

import {
  InMemoryNcrStore,
  InMemoryInspectionRequestStore,
  InMemorySnagStore,
} from './in-memory-quality-store';

import {
  PostgresNcrStore,
  PostgresInspectionRequestStore,
  PostgresSnagStore,
} from './postgres-quality-store';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: NCR_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresNcrStore(pool) : new InMemoryNcrStore(),
    },
    {
      provide: INSPECTION_REQUEST_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresInspectionRequestStore(pool) : new InMemoryInspectionRequestStore(),
    },
    {
      provide: SNAG_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSnagStore(pool) : new InMemorySnagStore(),
    },
    QualityService,
  ],
  exports: [QualityService],
})
export class QualityModule {}
