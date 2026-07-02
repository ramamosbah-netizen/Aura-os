// Split from postgres-quality-store.ts — one file per entity store.
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Ncr } from './domain/ncr';
import type { InspectionRequest } from './domain/inspection-request';
import type { Snag } from './domain/snag';
import type { Itp, ItpPoint } from './domain/itp';
import type { MaterialApproval } from './domain/material-approval';
import type { Calibration } from './domain/calibration';
import type { AuditSchedule } from './domain/audit-schedule';
import { type Page, PageParams, makePage } from '@aura/shared';
import type { NcrStore, InspectionRequestStore, SnagStore, ItpStore, MaterialApprovalStore, CalibrationStore, AuditScheduleStore, MaterialApprovalFilter } from './store.interface';

export class PostgresAuditScheduleStore implements AuditScheduleStore {
  constructor(private readonly pool: Pool) {}

  async save(audit: AuditSchedule, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_audit_schedules (
        id, tenant_id, company_id, project_id, project_name, audit_number, audit_type,
        scheduled_date, auditor_name, status, checklist, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      on conflict (id) do update set
        status = excluded.status,
        checklist = excluded.checklist,
        updated_at = excluded.updated_at`,
      [
        audit.id,
        audit.tenantId,
        audit.companyId,
        audit.projectId,
        audit.projectName,
        audit.auditNumber,
        audit.auditType,
        audit.scheduledDate,
        audit.auditorName,
        audit.status,
        JSON.stringify(audit.checklist),
        audit.createdAt,
        audit.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<AuditSchedule | null> {
    const res = await this.pool.query(
      `select * from public.aura_quality_audit_schedules where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapAudit(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<AuditSchedule[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_audit_schedules where project_id = $1 and tenant_id = $2 order by created_at desc`,
      [projectId, tenantId],
    );
    return res.rows.map((row) => this.mapAudit(row));
  }

  async findAll(tenantId: string): Promise<AuditSchedule[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_audit_schedules where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map((row) => this.mapAudit(row));
  }

  private mapAudit(row: any): AuditSchedule {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      auditNumber: row.audit_number,
      auditType: row.audit_type,
      scheduledDate: row.scheduled_date instanceof Date ? row.scheduled_date.toISOString().split('T')[0] : String(row.scheduled_date),
      auditorName: row.auditor_name,
      status: row.status,
      checklist: Array.isArray(row.checklist) ? row.checklist : JSON.parse(row.checklist || '[]'),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
