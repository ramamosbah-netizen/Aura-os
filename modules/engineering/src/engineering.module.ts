import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import { DRAWING_STORE } from './drawing-store';
import { InMemoryDrawingStore } from './in-memory-drawing-store';
import { PostgresDrawingStore } from './postgres-drawing-store';

import { RFI_STORE } from './rfi-store';
import { InMemoryRfiStore } from './in-memory-rfi-store';
import { PostgresRfiStore } from './postgres-rfi-store';

import { SUBMITTAL_STORE } from './submittal-store';
import { InMemorySubmittalStore } from './in-memory-submittal-store';
import { PostgresSubmittalStore } from './postgres-submittal-store';

import { TECHNICAL_QUERY_STORE } from './technical-query-store';
import { InMemoryTechnicalQueryStore } from './in-memory-technical-query-store';
import { PostgresTechnicalQueryStore } from './postgres-technical-query-store';

import { BIM_MODEL_STORE } from './bim-model-store';
import { InMemoryBimModelStore } from './in-memory-bim-model-store';
import { PostgresBimModelStore } from './postgres-bim-model-store';

import { EngineeringService } from './engineering.service';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: DRAWING_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresDrawingStore(pool) : new InMemoryDrawingStore(),
    },
    {
      provide: RFI_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresRfiStore(pool) : new InMemoryRfiStore(),
    },
    {
      provide: SUBMITTAL_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSubmittalStore(pool) : new InMemorySubmittalStore(),
    },
    {
      provide: TECHNICAL_QUERY_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTechnicalQueryStore(pool) : new InMemoryTechnicalQueryStore(),
    },
    {
      provide: BIM_MODEL_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresBimModelStore(pool) : new InMemoryBimModelStore(),
    },
    EngineeringService,
  ],
  exports: [EngineeringService],
})
export class EngineeringModule {}
