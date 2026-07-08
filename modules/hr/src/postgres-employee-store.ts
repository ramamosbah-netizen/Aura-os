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
import type { EmployeeStore, LeaveStore, PayrollRunStore, TimesheetStore, ExpenseClaimStore, StaffAdvanceStore, AttendanceStore, AppraisalStore, EmployeeFilter } from './store.interface';
import { type Page, type PageParams } from '@aura/shared';
import { pagePostgres } from './paged-query';

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

  async listPaged(filter: EmployeeFilter, page: PageParams): Promise<Page<Employee>> {
    const where = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    return pagePostgres(this.pool, { table: 'aura_hr_employees', where, params, orderBy: 'created_at DESC', map: (r) => this.mapEmployee(r) }, page);
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
