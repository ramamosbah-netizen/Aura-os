import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  NCR_STORE,
  INSPECTION_REQUEST_STORE,
  SNAG_STORE,
  ITP_STORE,
  QualityService,
} from './quality.service';

import {
  InMemoryNcrStore,
  InMemoryInspectionRequestStore,
  InMemorySnagStore,
  InMemoryItpStore,
} from './in-memory-quality-store';

import {
  PostgresNcrStore,
  PostgresInspectionRequestStore,
  PostgresSnagStore,
  PostgresItpStore,
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
    {
      provide: ITP_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresItpStore(pool) : new InMemoryItpStore(),
    },
    QualityService,
  ],
  exports: [QualityService],
})
export class QualityModule {}
