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

export class PostgresSnagStore implements SnagStore {
  constructor(private readonly pool: Pool) {}

  async save(snag: Snag, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_snags (
        id, tenant_id, company_id, project_id, project_name, description, location_detail, severity, status, assigned_to, resolved_at, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (id) do update set
        status = excluded.status,
        resolved_at = excluded.resolved_at,
        updated_at = excluded.updated_at`,
      [
        snag.id,
        snag.tenantId,
        snag.companyId,
        snag.projectId,
        snag.projectName,
        snag.description,
        snag.locationDetail,
        snag.severity,
        snag.status,
        snag.assignedTo,
        snag.resolvedAt,
        snag.createdBy,
        snag.createdAt,
        snag.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<Snag | null> {
    const res = await this.pool.query(
      `select * from public.aura_quality_snags where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapSnag(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<Snag[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_snags where project_id = $1 and tenant_id = $2 order by created_at desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapSnag);
  }

  async findAll(tenantId: string): Promise<Snag[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_snags where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapSnag);
  }

  async listPaged(tenantId: string, page: PageParams): Promise<Page<Snag>> {
    const countRes = await this.pool.query<{ count: number }>(
      `select count(*)::int as count from public.aura_quality_snags where tenant_id = $1`, [tenantId]);
    const res = await this.pool.query(
      `select * from public.aura_quality_snags where tenant_id = $1 order by created_at desc limit $2 offset $3`,
      [tenantId, page.limit, page.offset]);
    return makePage(res.rows.map(this.mapSnag), Number(countRes.rows[0]?.count ?? 0), page);
  }

  private mapSnag(row: QueryResultRow): Snag {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      description: row.description,
      locationDetail: row.location_detail,
      severity: row.severity,
      status: row.status,
      assignedTo: row.assigned_to,
      resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
