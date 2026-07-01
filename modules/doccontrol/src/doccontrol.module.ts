import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import { TRANSMITTAL_STORE, CORRESPONDENCE_STORE, SUBMITTAL_STORE, DRAWING_REGISTER_STORE } from './store.interface';
import { InMemoryTransmittalStore } from './in-memory-transmittal-store';
import { PostgresTransmittalStore } from './postgres-transmittal-store';

import { InMemoryCorrespondenceStore } from './in-memory-correspondence-store';
import { PostgresCorrespondenceStore } from './postgres-correspondence-store';

import { InMemorySubmittalStore } from './in-memory-submittal-store';
import { PostgresSubmittalStore } from './postgres-submittal-store';

import { InMemoryDrawingRegisterStore } from './in-memory-drawing-register-store';
import { PostgresDrawingRegisterStore } from './postgres-drawing-register-store';

import { DocControlService } from './doccontrol.service';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: TRANSMITTAL_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTransmittalStore(pool) : new InMemoryTransmittalStore(),
    },
    {
      provide: CORRESPONDENCE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCorrespondenceStore(pool) : new InMemoryCorrespondenceStore(),
    },
    {
      provide: SUBMITTAL_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSubmittalStore(pool) : new InMemorySubmittalStore(),
    },
    {
      provide: DRAWING_REGISTER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresDrawingRegisterStore(pool) : new InMemoryDrawingRegisterStore(),
    },
    DocControlService,
  ],
  exports: [DocControlService],
})
export class DocControlModule {}
