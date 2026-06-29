import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Ncr } from './domain/ncr';
import type { InspectionRequest } from './domain/inspection-request';
import type { Snag } from './domain/snag';
import type { NcrStore, InspectionRequestStore, SnagStore } from './store.interface';

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

  private mapNcr(row: any): Ncr {
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

  private mapIr(row: any): InspectionRequest {
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

  private mapSnag(row: any): Snag {
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
