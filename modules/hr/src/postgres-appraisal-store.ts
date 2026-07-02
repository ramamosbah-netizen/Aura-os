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
