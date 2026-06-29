import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  INCIDENT_STORE,
  PTW_STORE,
  CAPA_STORE,
  HseService,
} from './hse.service';

import {
  InMemoryHseIncidentStore,
  InMemoryPermitToWorkStore,
  InMemoryCapaActionStore,
} from './in-memory-hse-store';

import {
  PostgresHseIncidentStore,
  PostgresPermitToWorkStore,
  PostgresCapaActionStore,
} from './postgres-hse-store';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: INCIDENT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresHseIncidentStore(pool) : new InMemoryHseIncidentStore(),
    },
    {
      provide: PTW_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPermitToWorkStore(pool) : new InMemoryPermitToWorkStore(),
    },
    {
      provide: CAPA_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCapaActionStore(pool) : new InMemoryCapaActionStore(),
    },
    HseService,
  ],
  exports: [HseService],
})
export class HseModule {}
