import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  NCR_STORE,
  INSPECTION_REQUEST_STORE,
  SNAG_STORE,
  ITP_STORE,
  MATERIAL_APPROVAL_STORE,
  CALIBRATION_STORE,
  AUDIT_SCHEDULE_STORE,
  QualityService,
} from './quality.service';

import {
  InMemoryNcrStore,
  InMemoryInspectionRequestStore,
  InMemorySnagStore,
  InMemoryItpStore,
  InMemoryMaterialApprovalStore,
  InMemoryCalibrationStore,
  InMemoryAuditScheduleStore,
} from './in-memory-quality-store';

import {
  PostgresNcrStore,
  PostgresInspectionRequestStore,
  PostgresSnagStore,
  PostgresItpStore,
  PostgresMaterialApprovalStore,
  PostgresCalibrationStore,
  PostgresAuditScheduleStore,
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
    {
      provide: MATERIAL_APPROVAL_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresMaterialApprovalStore(pool) : new InMemoryMaterialApprovalStore(),
    },
    {
      provide: CALIBRATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCalibrationStore(pool) : new InMemoryCalibrationStore(),
    },
    {
      provide: AUDIT_SCHEDULE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresAuditScheduleStore(pool) : new InMemoryAuditScheduleStore(),
    },
    QualityService,
  ],
  exports: [QualityService],
})
export class QualityModule {}
