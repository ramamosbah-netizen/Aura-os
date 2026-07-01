import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Ncr } from './domain/ncr';
import type { InspectionRequest } from './domain/inspection-request';
import type { Snag } from './domain/snag';
import type { Itp, ItpPoint } from './domain/itp';
import type { MaterialApproval } from './domain/material-approval';
import type { NcrStore, InspectionRequestStore, SnagStore, ItpStore, MaterialApprovalStore } from './store.interface';

export class PostgresNcrStore implements NcrStore {
  constructor(private readonly pool: Pool) {}

  async save(ncr: Ncr, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_ncrs (
        id, tenant_id, company_id, project_id, project_name, ncr_number, description, root_cause, proposed_correction, severity, status, raised_by, assigned_to, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      on conflict (id) do update set
        status = excluded.status,
        root_cause = excluded.root_cause,
        proposed_correction = excluded.proposed_correction,
        updated_at = excluded.updated_at`,
      [
        ncr.id,
        ncr.tenantId,
        ncr.companyId,
        ncr.projectId,
        ncr.projectName,
        ncr.ncrNumber,
        ncr.description,
        ncr.rootCause,
        ncr.proposedCorrection,
        ncr.severity,
        ncr.status,
        ncr.raisedBy,
        ncr.assignedTo,
        ncr.createdAt,
        ncr.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<Ncr | null> {
    const res = await this.pool.query(
      `select * from public.aura_quality_ncrs where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapNcr(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<Ncr[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_ncrs where project_id = $1 and tenant_id = $2 order by created_at desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapNcr);
  }

  async findAll(tenantId: string): Promise<Ncr[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_ncrs where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapNcr);
  }

  private mapNcr(row: QueryResultRow): Ncr {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      ncrNumber: row.ncr_number,
      description: row.description,
      rootCause: row.root_cause,
      proposedCorrection: row.proposed_correction,
      severity: row.severity,
      status: row.status,
      raisedBy: row.raised_by,
      assignedTo: row.assigned_to,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

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
}
