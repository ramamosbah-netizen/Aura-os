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

export class PostgresMaterialApprovalStore implements MaterialApprovalStore {
  constructor(private readonly pool: Pool) {}

  async save(mar: MaterialApproval, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_material_approvals (
        id, tenant_id, company_id, project_id, project_name, reference, material_name, manufacturer, supplier,
        specification, discipline, status, revision, review_comments, reviewed_by, reviewed_at, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      on conflict (id) do update set
        status = excluded.status, revision = excluded.revision, review_comments = excluded.review_comments,
        reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at, updated_at = excluded.updated_at`,
      [mar.id, mar.tenantId, mar.companyId, mar.projectId, mar.projectName, mar.reference, mar.materialName, mar.manufacturer, mar.supplier,
       mar.specification, mar.discipline, mar.status, mar.revision, mar.reviewComments, mar.reviewedBy, mar.reviewedAt, mar.createdBy, mar.createdAt, mar.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<MaterialApproval | null> {
    const res = await this.pool.query(`select * from public.aura_quality_material_approvals where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : this.mapMar(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<MaterialApproval[]> {
    const res = await this.pool.query(`select * from public.aura_quality_material_approvals where project_id = $1 and tenant_id = $2 order by created_at desc`, [projectId, tenantId]);
    return res.rows.map(this.mapMar);
  }

  async findAll(tenantId: string): Promise<MaterialApproval[]> {
    const res = await this.pool.query(`select * from public.aura_quality_material_approvals where tenant_id = $1 order by created_at desc`, [tenantId]);
    return res.rows.map(this.mapMar);
  }

  private mapMar(row: QueryResultRow): MaterialApproval {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      reference: row.reference,
      materialName: row.material_name,
      manufacturer: row.manufacturer || '',
      supplier: row.supplier || '',
      specification: row.specification || '',
      discipline: row.discipline,
      status: row.status,
      revision: Number(row.revision),
      reviewComments: row.review_comments || '',
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : (row.reviewed_at ? String(row.reviewed_at) : null),
      createdBy: row.created_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  private buildWhere(filter: MaterialApprovalFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('status', filter.status);
    add('supplier', filter.supplier);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async listPaged(filter: MaterialApprovalFilter, page: PageParams): Promise<Page<MaterialApproval>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_quality_material_approvals ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<any>(
      `SELECT * FROM public.aura_quality_material_approvals ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map((row) => this.mapMar(row)), total, page);
  }
}
