import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Employee } from './domain/employee';
import type { Leave } from './domain/leave';
import type { PayrollRun } from './domain/payroll-run';
import type { TimesheetEntry } from './domain/timesheet';
import type { ExpenseClaim } from './domain/expense-claim';
import type { EmployeeStore, LeaveStore, PayrollRunStore, TimesheetStore, ExpenseClaimStore } from './store.interface';

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

export class PostgresEmployeeStore implements EmployeeStore {
  constructor(private readonly pool: Pool) {}

  async save(employee: Employee, tx?: TxHandle): Promise<Employee> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_hr_employees (
        id, tenant_id, company_id, first_name, last_name, email, phone, role, department, status, joined_date, visa_expiry, permit_expiry, labor_camp, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      on conflict (id) do update set
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        email = excluded.email,
        phone = excluded.phone,
        role = excluded.role,
        department = excluded.department,
        status = excluded.status,
        visa_expiry = excluded.visa_expiry,
        permit_expiry = excluded.permit_expiry,
        labor_camp = excluded.labor_camp,
        updated_at = excluded.updated_at
      returning *`,
      [
        employee.id,
        employee.tenantId,
        employee.companyId,
        employee.firstName,
        employee.lastName,
        employee.email,
        employee.phone,
        employee.role,
        employee.department,
        employee.status,
        employee.joinedDate,
        employee.visaExpiry,
        employee.permitExpiry,
        employee.laborCamp,
        employee.createdAt,
        employee.updatedAt,
      ],
    );
    return this.mapEmployee(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<Employee | null> {
    const res = await this.pool.query(
      `select * from public.aura_hr_employees where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapEmployee(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<Employee[]> {
    const res = await this.pool.query(
      `select * from public.aura_hr_employees where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapEmployee);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `delete from public.aura_hr_employees where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  private mapEmployee(row: any): Employee {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      department: row.department,
      status: row.status,
      joinedDate: dateOnly(row.joined_date) ?? '',
      visaExpiry: dateOnly(row.visa_expiry),
      permitExpiry: dateOnly(row.permit_expiry),
      laborCamp: row.labor_camp,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
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

  private mapLeave(row: any): Leave {
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

  private mapPayrollRun(row: any): PayrollRun {
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

  private mapTs(row: any): TimesheetEntry {
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

  private mapClaim(row: any): ExpenseClaim {
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
