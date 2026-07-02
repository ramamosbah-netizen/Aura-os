// Split from postgres-hr-store.ts — one file per entity store.
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Employee } from './domain/employee';
import type { Leave } from './domain/leave';
import type { PayrollRun } from './domain/payroll-run';
import type { TimesheetEntry } from './domain/timesheet';
import type { ExpenseClaim } from './domain/expense-claim';
import type { StaffAdvance } from './domain/staff-advance';
import type { AttendanceRecord } from './domain/attendance';
import type { PerformanceAppraisal, AppraisalCriterion } from './domain/appraisal';
import type { EmployeeStore, LeaveStore, PayrollRunStore, TimesheetStore, ExpenseClaimStore, StaffAdvanceStore, AttendanceStore, AppraisalStore } from './store.interface';

/**
 * Format a `date` column as YYYY-MM-DD using LOCAL parts. node-pg parses `date` to a Date at
 * local midnight; `toISOString()` would shift it a day in a UTC+ timezone (the date-drift bug).
 */
function dateOnly(v: Date | string | null): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

export class PostgresLeaveStore implements LeaveStore {
  constructor(private readonly pool: Pool) {}

  async save(leave: Leave, tx?: TxHandle): Promise<Leave> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_hr_leaves (
        id, tenant_id, company_id, employee_id, leave_type, start_date, end_date, status, reason, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      on conflict (id) do update set
        status = excluded.status,
        updated_at = excluded.updated_at
      returning *`,
      [
        leave.id,
        leave.tenantId,
        leave.companyId,
        leave.employeeId,
        leave.leaveType,
        leave.startDate,
        leave.endDate,
        leave.status,
        leave.reason,
        leave.createdAt,
        leave.updatedAt,
      ],
    );
    return this.mapLeave(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<Leave | null> {
    const res = await this.pool.query(
      `select * from public.aura_hr_leaves where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapLeave(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<Leave[]> {
    const res = await this.pool.query(
      `select * from public.aura_hr_leaves where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapLeave);
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<Leave[]> {
    const res = await this.pool.query(
      `select * from public.aura_hr_leaves where tenant_id = $1 and employee_id = $2 order by created_at desc`,
      [tenantId, employeeId],
    );
    return res.rows.map(this.mapLeave);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `delete from public.aura_hr_leaves where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  private mapLeave(row: QueryResultRow): Leave {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      leaveType: row.leave_type,
      startDate: dateOnly(row.start_date) ?? '',
      endDate: dateOnly(row.end_date) ?? '',
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
