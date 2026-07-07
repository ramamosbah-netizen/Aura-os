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
import type { EmployeeStore, LeaveStore, PayrollRunStore, TimesheetStore, ExpenseClaimStore, StaffAdvanceStore, AttendanceStore, AppraisalStore, EmployeeScopedFilter } from './store.interface';
import { type Page, type PageParams } from '@aura/shared';
import { pagePostgres, scopedWhere } from './paged-query';

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

export class PostgresTimesheetStore implements TimesheetStore {
  constructor(private readonly pool: Pool) {}

  async save(entry: TimesheetEntry, tx?: TxHandle): Promise<TimesheetEntry> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_hr_timesheets (
        id, tenant_id, employee_id, project_id, wbs_node_id, date, hours, overtime, description, status, created_at, approved_by
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      on conflict (id) do update set
        status = excluded.status, approved_by = excluded.approved_by
      returning *`,
      [entry.id, entry.tenantId, entry.employeeId, entry.projectId, entry.wbsNodeId, entry.date, entry.hours, entry.overtime, entry.description, entry.status, entry.createdAt, entry.approvedBy],
    );
    return this.mapTs(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<TimesheetEntry | null> {
    const res = await this.pool.query(`select * from public.aura_hr_timesheets where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rows.length ? this.mapTs(res.rows[0]) : null;
  }

  async findByTenant(tenantId: string): Promise<TimesheetEntry[]> {
    const res = await this.pool.query(`select * from public.aura_hr_timesheets where tenant_id = $1 order by date desc limit 200`, [tenantId]);
    return res.rows.map(this.mapTs);
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<TimesheetEntry[]> {
    const res = await this.pool.query(`select * from public.aura_hr_timesheets where tenant_id = $1 and employee_id = $2 order by date desc`, [tenantId, employeeId]);
    return res.rows.map(this.mapTs);
  }

  async findByDateRange(tenantId: string, employeeId: string, from: string, to: string): Promise<TimesheetEntry[]> {
    const res = await this.pool.query(
      `select * from public.aura_hr_timesheets where tenant_id = $1 and employee_id = $2 and date >= $3 and date <= $4 order by date asc`,
      [tenantId, employeeId, from, to],
    );
    return res.rows.map(this.mapTs);
  }

  async listPaged(filter: EmployeeScopedFilter, page: PageParams): Promise<Page<TimesheetEntry>> {
    const { where, params } = scopedWhere(filter);
    return pagePostgres(this.pool, { table: 'aura_hr_timesheets', where, params, orderBy: 'date DESC', map: (r) => this.mapTs(r) }, page);
  }

  private mapTs(row: QueryResultRow): TimesheetEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      projectId: row.project_id,
      wbsNodeId: row.wbs_node_id,
      date: dateOnly(row.date) ?? '',
      hours: Number(row.hours),
      overtime: Number(row.overtime),
      description: row.description || '',
      status: row.status,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      approvedBy: row.approved_by,
    };
  }
}
