// Split from postgres-quality-store.ts — one file per entity store.
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { InspectionRequest } from './domain/inspection-request';
import type { IrEvidence } from './domain/ir-evidence';
import { type Page, PageParams, makePage } from '@aura/shared';
import type { InspectionRequestStore } from './store.interface';

interface IrEvidenceRow {
  id: string; tenant_id: string; company_id: string | null; inspection_id: string;
  project_id: string; file_id: string; category: string; description: string | null;
  location: string | null; captured_at: string | Date | null; captured_by: string | null;
  hash: string | null; signed_by: string | null; signed_content_hash: string | null;
  created_at: string | Date;
}

const iso = (v: string | Date): string => (typeof v === 'string' ? v : new Date(v).toISOString());

function toIrEvidence(r: IrEvidenceRow): IrEvidence {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    inspectionId: r.inspection_id,
    projectId: r.project_id,
    fileId: r.file_id,
    category: r.category as IrEvidence['category'],
    description: r.description,
    location: r.location,
    capturedAt: r.captured_at ? iso(r.captured_at) : null,
    capturedBy: r.captured_by,
    hash: r.hash,
    signedBy: r.signed_by,
    signedContentHash: r.signed_content_hash,
    createdAt: iso(r.created_at),
  };
}

export class PostgresInspectionRequestStore implements InspectionRequestStore {
  constructor(private readonly pool: Pool) {}

  /**
   * APPEND-ONLY. An inspection re-signed after being re-measured keeps the earlier row: that it
   * was signed once and then changed is exactly what somebody checking a measured quantity needs
   * to see, and an upsert would erase it.
   */
  async saveEvidence(e: IrEvidence, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_ir_evidence (
        id, tenant_id, company_id, inspection_id, project_id, file_id, category, description,
        location, captured_at, captured_by, hash, signed_by, signed_content_hash, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [e.id, e.tenantId, e.companyId, e.inspectionId, e.projectId, e.fileId, e.category,
       e.description, e.location, e.capturedAt, e.capturedBy, e.hash, e.signedBy,
       e.signedContentHash, e.createdAt],
    );
  }

  async listEvidence(inspectionId: string, tenantId: string): Promise<IrEvidence[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_ir_evidence
        where inspection_id = $1 and tenant_id = $2 order by created_at asc`,
      [inspectionId, tenantId],
    );
    return res.rows.map(toIrEvidence);
  }

  async save(ir: InspectionRequest, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_irs (
        id, tenant_id, company_id, project_id, project_name, ir_number, discipline, location_detail, inspection_date, status, inspected_by, comments, created_at, updated_at, boq_item_id, approved_quantity, unit
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
        ir.boqItemId,
        ir.approvedQuantity,
        ir.unit,
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
      boqItemId: row.boq_item_id ?? null,
      approvedQuantity: row.approved_quantity != null ? Number(row.approved_quantity) : null,
      unit: row.unit ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
