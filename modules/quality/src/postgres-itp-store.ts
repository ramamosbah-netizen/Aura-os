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

export class PostgresItpStore implements ItpStore {
  constructor(private readonly pool: Pool) {}

  async save(itp: Itp, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_itps (
        id, tenant_id, company_id, project_id, project_name, reference, title, discipline, status, points, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict (id) do update set
        status = excluded.status, points = excluded.points, updated_at = excluded.updated_at`,
      [itp.id, itp.tenantId, itp.companyId, itp.projectId, itp.projectName, itp.reference, itp.title, itp.discipline, itp.status, JSON.stringify(itp.points), itp.createdBy, itp.createdAt, itp.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<Itp | null> {
    const res = await this.pool.query(`select * from public.aura_quality_itps where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : this.mapItp(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<Itp[]> {
    const res = await this.pool.query(`select * from public.aura_quality_itps where project_id = $1 and tenant_id = $2 order by created_at desc`, [projectId, tenantId]);
    return res.rows.map(this.mapItp);
  }

  async findAll(tenantId: string): Promise<Itp[]> {
    const res = await this.pool.query(`select * from public.aura_quality_itps where tenant_id = $1 order by created_at desc`, [tenantId]);
    return res.rows.map(this.mapItp);
  }

  async listPaged(tenantId: string, page: PageParams): Promise<Page<Itp>> {
    const countRes = await this.pool.query<{ count: number }>(
      `select count(*)::int as count from public.aura_quality_itps where tenant_id = $1`, [tenantId]);
    const res = await this.pool.query(
      `select * from public.aura_quality_itps where tenant_id = $1 order by created_at desc limit $2 offset $3`,
      [tenantId, page.limit, page.offset]);
    return makePage(res.rows.map(this.mapItp), Number(countRes.rows[0]?.count ?? 0), page);
  }

  private mapItp(row: QueryResultRow): Itp {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      reference: row.reference,
      title: row.title,
      discipline: row.discipline,
      status: row.status,
      points: (typeof row.points === 'string' ? JSON.parse(row.points) : row.points) as ItpPoint[],
      createdBy: row.created_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
