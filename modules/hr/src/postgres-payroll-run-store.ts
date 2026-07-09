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

export class PostgresPayrollRunStore implements PayrollRunStore {
  constructor(private readonly pool: Pool) {}

  async save(payrollRun: PayrollRun, tx?: TxHandle): Promise<PayrollRun> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_hr_payroll_runs (
        id, tenant_id, company_id, employee_id, period_start, period_end, basic_salary, allowances, deductions, net_salary, status, processed_at, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (id) do update set
        status = excluded.status,
        processed_at = excluded.processed_at,
        updated_at = excluded.updated_at
      returning *`,
      [
        payrollRun.id,
        payrollRun.tenantId,
        payrollRun.companyId,
        payrollRun.employeeId,
        payrollRun.periodStart,
        payrollRun.periodEnd,
        payrollRun.basicSalary,
        payrollRun.allowances,
        payrollRun.deductions,
        payrollRun.netSalary,
        payrollRun.status,
        payrollRun.processedAt,
        payrollRun.createdAt,
        payrollRun.updatedAt,
      ],
    );
    return this.mapPayrollRun(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<PayrollRun | null> {
    const res = await this.pool.query(
      `select * from public.aura_hr_payroll_runs where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapPayrollRun(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<PayrollRun[]> {
    const res = await this.pool.query(
      `select * from public.aura_hr_payroll_runs where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapPayrollRun);
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<PayrollRun[]> {
    const res = await this.pool.query(
      `select * from public.aura_hr_payroll_runs where tenant_id = $1 and employee_id = $2 order by created_at desc`,
      [tenantId, employeeId],
    );
    return res.rows.map(this.mapPayrollRun);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `delete from public.aura_hr_payroll_runs where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listPaged(filter: EmployeeScopedFilter, page: PageParams): Promise<Page<PayrollRun>> {
    const { where, params } = scopedWhere(filter);
    return pagePostgres(this.pool, { table: 'aura_hr_payroll_runs', where, params, orderBy: 'created_at DESC', map: (r) => this.mapPayrollRun(r) }, page);
  }

  private mapPayrollRun(row: QueryResultRow): PayrollRun {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      basicSalary: Number(row.basic_salary),
      allowances: Number(row.allowances),
      deductions: Number(row.deductions),
      netSalary: Number(row.net_salary),
      periodStart: dateOnly(row.period_start) ?? '',
      periodEnd: dateOnly(row.period_end) ?? '',
      status: row.status,
      processedAt: row.processed_at ? row.processed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
