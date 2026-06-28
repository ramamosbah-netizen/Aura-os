import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { TENDER_STORE } from './tender-store';
import { InMemoryTenderStore } from './in-memory-tender-store';
import { PostgresTenderStore } from './postgres-tender-store';
import { BOQ_STORE } from './boq-store';
import { InMemoryBOQStore } from './in-memory-boq-store';
import { PostgresBOQStore } from './postgres-boq-store';
import { TenderService } from './tender.service';

/** The Tendering business module — same shape as CRM (the module template). */
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: TENDER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTenderStore(pool) : new InMemoryTenderStore(),
    },
    {
      provide: BOQ_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresBOQStore(pool) : new InMemoryBOQStore(),
    },
    TenderService,
  ],
  exports: [TenderService],
})
export class TenderingModule {}
