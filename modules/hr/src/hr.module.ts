import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  EMPLOYEE_STORE,
  LEAVE_STORE,
  PAYROLL_RUN_STORE,
  TIMESHEET_STORE,
  EXPENSE_CLAIM_STORE,
  STAFF_ADVANCE_STORE,
  ATTENDANCE_STORE,
  HrService,
} from './hr.service';

import {
  InMemoryEmployeeStore,
  InMemoryLeaveStore,
  InMemoryPayrollRunStore,
  InMemoryTimesheetStore,
  InMemoryExpenseClaimStore,
  InMemoryStaffAdvanceStore,
  InMemoryAttendanceStore,
} from './in-memory-hr-store';

import {
  PostgresEmployeeStore,
  PostgresLeaveStore,
  PostgresPayrollRunStore,
  PostgresTimesheetStore,
  PostgresExpenseClaimStore,
  PostgresStaffAdvanceStore,
  PostgresAttendanceStore,
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
    {
      provide: TIMESHEET_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTimesheetStore(pool) : new InMemoryTimesheetStore(),
    },
    {
      provide: EXPENSE_CLAIM_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresExpenseClaimStore(pool) : new InMemoryExpenseClaimStore(),
    },
    {
      provide: STAFF_ADVANCE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresStaffAdvanceStore(pool) : new InMemoryStaffAdvanceStore(),
    },
    {
      provide: ATTENDANCE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresAttendanceStore(pool) : new InMemoryAttendanceStore(),
    },
    HrService,
  ],
  exports: [HrService],
})
export class HrModule {}
