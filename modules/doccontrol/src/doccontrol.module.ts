import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import { TRANSMITTAL_STORE, CORRESPONDENCE_STORE } from './store.interface';
import { InMemoryTransmittalStore } from './in-memory-transmittal-store';
import { PostgresTransmittalStore } from './postgres-transmittal-store';

import { InMemoryCorrespondenceStore } from './in-memory-correspondence-store';
import { PostgresCorrespondenceStore } from './postgres-correspondence-store';

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
    DocControlService,
  ],
  exports: [DocControlService],
})
export class DocControlModule {}
