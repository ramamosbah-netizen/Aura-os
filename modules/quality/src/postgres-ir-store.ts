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

export class PostgresInspectionRequestStore implements InspectionRequestStore {
  constructor(private readonly pool: Pool) {}

  async save(ir: InspectionRequest, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_irs (
        id, tenant_id, company_id, project_id, project_name, ir_number, discipline, location_detail, inspection_date, status, inspected_by, comments, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (id) do update set
        status = excluded.status,
        inspected_by = excluded.inspected_by,
        comments = excluded.comments,
        updated_at = excluded.updated_at`,
      [
        ir.id,
        ir.tenantId,
        ir.companyId,
        ir.projectId,
        ir.projectName,
        ir.irNumber,
        ir.discipline,
        ir.locationDetail,
        ir.inspectionDate,
        ir.status,
        ir.inspectedBy,
        ir.comments,
        ir.createdAt,
        ir.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<InspectionRequest | null> {
    const res = await this.pool.query(
      `select * from public.aura_quality_irs where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapIr(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<InspectionRequest[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_irs where project_id = $1 and tenant_id = $2 order by inspection_date desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapIr);
  }

  async findAll(tenantId: string): Promise<InspectionRequest[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_irs where tenant_id = $1 order by inspection_date desc`,
      [tenantId],
    );
    return res.rows.map(this.mapIr);
  }

  async listPaged(tenantId: string, page: PageParams): Promise<Page<InspectionRequest>> {
    const countRes = await this.pool.query<{ count: number }>(
      `select count(*)::int as count from public.aura_quality_irs where tenant_id = $1`, [tenantId]);
    const res = await this.pool.query(
      `select * from public.aura_quality_irs where tenant_id = $1 order by inspection_date desc limit $2 offset $3`,
      [tenantId, page.limit, page.offset]);
    return makePage(res.rows.map(this.mapIr), Number(countRes.rows[0]?.count ?? 0), page);
  }

  private mapIr(row: QueryResultRow): InspectionRequest {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      irNumber: row.ir_number,
      discipline: row.discipline,
      locationDetail: row.location_detail,
      inspectionDate: row.inspection_date instanceof Date ? row.inspection_date.toISOString().split('T')[0] : String(row.inspection_date),
      status: row.status,
      inspectedBy: row.inspected_by,
      comments: row.comments,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
