import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { PROJECT_STORE } from './project-store';
import { InMemoryProjectStore } from './in-memory-project-store';
import { PostgresProjectStore } from './postgres-project-store';
import { ProjectService } from './project.service';

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
    ProjectService,
  ],
  exports: [ProjectService],
})
export class ProjectsModule {}
