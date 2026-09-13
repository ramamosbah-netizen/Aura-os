import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  INCIDENT_STORE,
  PTW_STORE,
  CAPA_STORE,
  TOOLBOX_STORE,
  RISK_ASSESSMENT_STORE,
  SAFETY_TRAINING_STORE,
  HseService,
} from './hse.service';

import {
  InMemoryHseIncidentStore,
  InMemoryPermitToWorkStore,
  InMemoryCapaActionStore,
  InMemoryToolboxTalkStore,
  InMemoryRiskAssessmentStore,
  InMemorySafetyTrainingStore,
} from './in-memory-hse-store';

import {
  PostgresHseIncidentStore,
  PostgresPermitToWorkStore,
  PostgresCapaActionStore,
  PostgresToolboxTalkStore,
  PostgresRiskAssessmentStore,
  PostgresSafetyTrainingStore,
} from './postgres-hse-store';
import { HseProjectResolvers } from './project-resolvers';

@Module({
  imports: [CoreModule],
  providers: [
    // Tells the permission guard which project each record belongs to, so entity-addressed
    // routes can be authorised by a project-scoped grant. See project-resolvers.ts.
    HseProjectResolvers,
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
    {
      provide: TOOLBOX_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresToolboxTalkStore(pool) : new InMemoryToolboxTalkStore(),
    },
    {
      provide: RISK_ASSESSMENT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresRiskAssessmentStore(pool) : new InMemoryRiskAssessmentStore(),
    },
    {
      provide: SAFETY_TRAINING_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSafetyTrainingStore(pool) : new InMemorySafetyTrainingStore(),
    },
    HseService,
  ],
  exports: [HseService],
})
export class HseModule {}
