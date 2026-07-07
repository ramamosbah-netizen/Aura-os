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

export class PostgresAttendanceStore implements AttendanceStore {
  constructor(private readonly pool: Pool) {}

  async save(r: AttendanceRecord, tx?: TxHandle): Promise<AttendanceRecord> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hr_attendance (
        id, tenant_id, company_id, employee_id, employee_name, date, check_in, check_out, status, worked_hours, notes, created_at, created_by
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict (id) do update set
        check_in = excluded.check_in, check_out = excluded.check_out, status = excluded.status, worked_hours = excluded.worked_hours, notes = excluded.notes`,
      [r.id, r.tenantId, r.companyId, r.employeeId, r.employeeName, r.date, r.checkIn, r.checkOut, r.status, r.workedHours, r.notes, r.createdAt, r.createdBy],
    );
    return r;
  }

  async findById(tenantId: string, id: string): Promise<AttendanceRecord | null> {
    const res = await this.pool.query(`select * from public.aura_hr_attendance where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rows.length ? this.mapAtt(res.rows[0]) : null;
  }

  async findByTenant(tenantId: string): Promise<AttendanceRecord[]> {
    const res = await this.pool.query(`select * from public.aura_hr_attendance where tenant_id = $1 order by date desc limit 200`, [tenantId]);
    return res.rows.map((r) => this.mapAtt(r));
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<AttendanceRecord[]> {
    const res = await this.pool.query(`select * from public.aura_hr_attendance where tenant_id = $1 and employee_id = $2 order by date desc`, [tenantId, employeeId]);
    return res.rows.map((r) => this.mapAtt(r));
  }

  async findByDateRange(tenantId: string, from: string, to: string, employeeId?: string): Promise<AttendanceRecord[]> {
    const res = employeeId
      ? await this.pool.query(`select * from public.aura_hr_attendance where tenant_id = $1 and date >= $2 and date <= $3 and employee_id = $4 order by date asc`, [tenantId, from, to, employeeId])
      : await this.pool.query(`select * from public.aura_hr_attendance where tenant_id = $1 and date >= $2 and date <= $3 order by date asc`, [tenantId, from, to]);
    return res.rows.map((r) => this.mapAtt(r));
  }

  async listPaged(filter: EmployeeScopedFilter, page: PageParams): Promise<Page<AttendanceRecord>> {
    const { where, params } = scopedWhere(filter);
    return pagePostgres(this.pool, { table: 'aura_hr_attendance', where, params, orderBy: 'date DESC', map: (r) => this.mapAtt(r) }, page);
  }

  private mapAtt(row: QueryResultRow): AttendanceRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      employeeName: row.employee_name || 'Employee',
      date: dateOnly(row.date) ?? '',
      checkIn: row.check_in,
      checkOut: row.check_out,
      status: row.status,
      workedHours: Number(row.worked_hours),
      notes: row.notes || '',
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      createdBy: row.created_by,
    };
  }
}
