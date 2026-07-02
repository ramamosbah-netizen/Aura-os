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

export class PostgresEmployeeStore implements EmployeeStore {
  constructor(private readonly pool: Pool) {}

  async save(employee: Employee, tx?: TxHandle): Promise<Employee> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_hr_employees (
        id, tenant_id, company_id, first_name, last_name, email, phone, role, department, manager_id, status, joined_date, visa_expiry, permit_expiry, labor_camp, iban, mol_employee_id, bank_routing_code, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      on conflict (id) do update set
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        email = excluded.email,
        phone = excluded.phone,
        role = excluded.role,
        department = excluded.department,
        manager_id = excluded.manager_id,
        status = excluded.status,
        visa_expiry = excluded.visa_expiry,
        permit_expiry = excluded.permit_expiry,
        labor_camp = excluded.labor_camp,
        iban = excluded.iban,
        mol_employee_id = excluded.mol_employee_id,
        bank_routing_code = excluded.bank_routing_code,
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
        employee.managerId,
        employee.status,
        employee.joinedDate,
        employee.visaExpiry,
        employee.permitExpiry,
        employee.laborCamp,
        employee.iban,
        employee.molEmployeeId,
        employee.bankRoutingCode,
        employee.createdAt,
        employee.updatedAt,
      ],
    );
    return this.mapEmployee(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<Employee | null> {
    const res = await this.pool.query(
      `select * from public.aura_hr_employees where id = $1 and tenant_id = $2 and deleted_at is null`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapEmployee(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<Employee[]> {
    const res = await this.pool.query(
      `select * from public.aura_hr_employees where tenant_id = $1 and deleted_at is null order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapEmployee);
  }

  async setDeleted(tenantId: string, id: string, deleted: boolean): Promise<boolean> {
    const res = await this.pool.query(
      `update public.aura_hr_employees set deleted_at = ${deleted ? 'now()' : 'NULL'} where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  private mapEmployee(row: QueryResultRow): Employee {
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
      managerId: row.manager_id ?? null,
      status: row.status,
      joinedDate: dateOnly(row.joined_date) ?? '',
      visaExpiry: dateOnly(row.visa_expiry),
      permitExpiry: dateOnly(row.permit_expiry),
      laborCamp: row.labor_camp,
      iban: row.iban ?? null,
      molEmployeeId: row.mol_employee_id ?? null,
      bankRoutingCode: row.bank_routing_code ?? null,
      deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
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

export class PostgresAppraisalStore implements AppraisalStore {
  constructor(private readonly pool: Pool) {}

  async save(a: PerformanceAppraisal, tx?: TxHandle): Promise<PerformanceAppraisal> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hr_appraisals (
        id, tenant_id, company_id, employee_id, employee_name, period, reviewer_id, criteria, overall_score,
        status, strengths, improvements, comments, submitted_at, acknowledged_at, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      on conflict (id) do update set
        criteria = excluded.criteria, overall_score = excluded.overall_score, status = excluded.status,
        strengths = excluded.strengths, improvements = excluded.improvements, comments = excluded.comments,
        submitted_at = excluded.submitted_at, acknowledged_at = excluded.acknowledged_at, updated_at = excluded.updated_at`,
      [a.id, a.tenantId, a.companyId, a.employeeId, a.employeeName, a.period, a.reviewerId, JSON.stringify(a.criteria), a.overallScore,
       a.status, a.strengths, a.improvements, a.comments, a.submittedAt, a.acknowledgedAt, a.createdBy, a.createdAt, a.updatedAt],
    );
    return a;
  }

  async findById(tenantId: string, id: string): Promise<PerformanceAppraisal | null> {
    const res = await this.pool.query(`select * from public.aura_hr_appraisals where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rows.length ? this.mapAppraisal(res.rows[0]) : null;
  }

  async findByTenant(tenantId: string): Promise<PerformanceAppraisal[]> {
    const res = await this.pool.query(`select * from public.aura_hr_appraisals where tenant_id = $1 order by created_at desc`, [tenantId]);
    return res.rows.map((r) => this.mapAppraisal(r));
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<PerformanceAppraisal[]> {
    const res = await this.pool.query(`select * from public.aura_hr_appraisals where tenant_id = $1 and employee_id = $2 order by created_at desc`, [tenantId, employeeId]);
    return res.rows.map((r) => this.mapAppraisal(r));
  }

  private mapAppraisal(row: QueryResultRow): PerformanceAppraisal {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      period: row.period,
      reviewerId: row.reviewer_id,
      criteria: (typeof row.criteria === 'string' ? JSON.parse(row.criteria) : (row.criteria ?? [])) as AppraisalCriterion[],
      overallScore: Number(row.overall_score),
      status: row.status,
      strengths: row.strengths,
      improvements: row.improvements,
      comments: row.comments,
      submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : (row.submitted_at ? String(row.submitted_at) : null),
      acknowledgedAt: row.acknowledged_at instanceof Date ? row.acknowledged_at.toISOString() : (row.acknowledged_at ? String(row.acknowledged_at) : null),
      createdBy: row.created_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
