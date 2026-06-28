import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  EMPLOYEE_STORE,
  LEAVE_STORE,
  PAYROLL_RUN_STORE,
  HrService,
} from './hr.service';

import {
  InMemoryEmployeeStore,
  InMemoryLeaveStore,
  InMemoryPayrollRunStore,
} from './in-memory-hr-store';

import {
  PostgresEmployeeStore,
  PostgresLeaveStore,
  PostgresPayrollRunStore,
} from './postgres-hr-store';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: EMPLOYEE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresEmployeeStore(pool) : new InMemoryEmployeeStore(),
    },
    {
      provide: LEAVE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresLeaveStore(pool) : new InMemoryLeaveStore(),
    },
    {
      provide: PAYROLL_RUN_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPayrollRunStore(pool) : new InMemoryPayrollRunStore(),
    },
    HrService,
  ],
  exports: [HrService],
})
export class HrModule {}
