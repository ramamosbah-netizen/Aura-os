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

const EXPENSE_COLS =
  'id, tenant_id, employee_id, project_id, category, amount, expense_date::text AS expense_date, description, status, approved_by, reimbursed_date::text AS reimbursed_date, created_at';

export class PostgresExpenseClaimStore implements ExpenseClaimStore {
  constructor(private readonly pool: Pool) {}

  async save(claim: ExpenseClaim, tx?: TxHandle): Promise<ExpenseClaim> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hr_expense_claims (
        id, tenant_id, employee_id, project_id, category, amount, expense_date, description, status, approved_by, reimbursed_date, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      on conflict (id) do update set
        status = excluded.status, approved_by = excluded.approved_by, reimbursed_date = excluded.reimbursed_date`,
      [claim.id, claim.tenantId, claim.employeeId, claim.projectId, claim.category, claim.amount, claim.expenseDate, claim.description, claim.status, claim.approvedBy, claim.reimbursedDate, claim.createdAt],
    );
    return claim;
  }

  async findById(tenantId: string, id: string): Promise<ExpenseClaim | null> {
    const res = await this.pool.query(`select ${EXPENSE_COLS} from public.aura_hr_expense_claims where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rows.length ? this.mapClaim(res.rows[0]) : null;
  }

  async findByTenant(tenantId: string): Promise<ExpenseClaim[]> {
    const res = await this.pool.query(`select ${EXPENSE_COLS} from public.aura_hr_expense_claims where tenant_id = $1 order by created_at desc limit 200`, [tenantId]);
    return res.rows.map((r) => this.mapClaim(r));
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<ExpenseClaim[]> {
    const res = await this.pool.query(`select ${EXPENSE_COLS} from public.aura_hr_expense_claims where tenant_id = $1 and employee_id = $2 order by created_at desc`, [tenantId, employeeId]);
    return res.rows.map((r) => this.mapClaim(r));
  }

  async listPaged(filter: EmployeeScopedFilter, page: PageParams): Promise<Page<ExpenseClaim>> {
    const { where, params } = scopedWhere(filter);
    return pagePostgres(this.pool, { table: 'aura_hr_expense_claims', cols: EXPENSE_COLS, where, params, orderBy: 'created_at DESC', map: (r) => this.mapClaim(r) }, page);
  }

  private mapClaim(row: QueryResultRow): ExpenseClaim {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      projectId: row.project_id,
      category: row.category,
      amount: Number(row.amount),
      expenseDate: String(row.expense_date),
      description: row.description || '',
      status: row.status,
      approvedBy: row.approved_by,
      reimbursedDate: row.reimbursed_date ? String(row.reimbursed_date) : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }
}
