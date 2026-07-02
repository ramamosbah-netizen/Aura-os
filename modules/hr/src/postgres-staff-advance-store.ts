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

const ADVANCE_COLS =
  'id, tenant_id, employee_id, amount, reason, installments, amount_repaid, status, request_date::text AS request_date, approved_by, disbursed_date::text AS disbursed_date, created_at';

export class PostgresStaffAdvanceStore implements StaffAdvanceStore {
  constructor(private readonly pool: Pool) {}

  async save(a: StaffAdvance, tx?: TxHandle): Promise<StaffAdvance> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hr_staff_advances (
        id, tenant_id, employee_id, amount, reason, installments, amount_repaid, status, request_date, approved_by, disbursed_date, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      on conflict (id) do update set
        amount_repaid = excluded.amount_repaid, status = excluded.status, approved_by = excluded.approved_by, disbursed_date = excluded.disbursed_date`,
      [a.id, a.tenantId, a.employeeId, a.amount, a.reason, a.installments, a.amountRepaid, a.status, a.requestDate, a.approvedBy, a.disbursedDate, a.createdAt],
    );
    return a;
  }

  async findById(tenantId: string, id: string): Promise<StaffAdvance | null> {
    const res = await this.pool.query(`select ${ADVANCE_COLS} from public.aura_hr_staff_advances where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rows.length ? this.mapAdvance(res.rows[0]) : null;
  }

  async findByTenant(tenantId: string): Promise<StaffAdvance[]> {
    const res = await this.pool.query(`select ${ADVANCE_COLS} from public.aura_hr_staff_advances where tenant_id = $1 order by created_at desc limit 200`, [tenantId]);
    return res.rows.map((r) => this.mapAdvance(r));
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<StaffAdvance[]> {
    const res = await this.pool.query(`select ${ADVANCE_COLS} from public.aura_hr_staff_advances where tenant_id = $1 and employee_id = $2 order by created_at desc`, [tenantId, employeeId]);
    return res.rows.map((r) => this.mapAdvance(r));
  }

  private mapAdvance(row: QueryResultRow): StaffAdvance {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      amount: Number(row.amount),
      reason: row.reason || '',
      installments: Number(row.installments),
      amountRepaid: Number(row.amount_repaid),
      status: row.status,
      requestDate: String(row.request_date),
      approvedBy: row.approved_by,
      disbursedDate: row.disbursed_date ? String(row.disbursed_date) : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }
}
