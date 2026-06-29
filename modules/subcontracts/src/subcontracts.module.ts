import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { SUBCONTRACT_STORE } from './subcontract-store';
import { InMemorySubcontractStore } from './in-memory-subcontract-store';
import { PostgresSubcontractStore } from './postgres-subcontract-store';
import { SubcontractsService } from './subcontracts.service';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: SUBCONTRACT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSubcontractStore(pool) : new InMemorySubcontractStore(),
    },
    SubcontractsService,
  ],
  exports: [SubcontractsService],
})
export class SubcontractsModule {}
