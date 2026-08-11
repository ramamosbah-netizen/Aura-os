// Split from postgres-quality-store.ts — one file per entity store.
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Ncr } from './domain/ncr';
import { type Page, PageParams, makePage } from '@aura/shared';
import type { NcrStore } from './store.interface';

const iso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

export class PostgresNcrStore implements NcrStore {
  constructor(private readonly pool: Pool) {}

  // The corrective action is persisted in the pre-existing `proposed_correction` column (no new
  // column needed); the workflow stamps + IR provenance are the added columns (migration 0224).
  async save(ncr: Ncr, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_ncrs (
        id, tenant_id, company_id, project_id, project_name, ncr_number, description, root_cause,
        proposed_correction, severity, status, raised_by, assigned_to, source_ir_id, source_ir_number,
        action_planned_at, corrected_by, corrected_at, verified_by, verified_at, closed_at, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      on conflict (id) do update set
        status = excluded.status,
        root_cause = excluded.root_cause,
        proposed_correction = excluded.proposed_correction,
        assigned_to = excluded.assigned_to,
        action_planned_at = excluded.action_planned_at,
        corrected_by = excluded.corrected_by,
        corrected_at = excluded.corrected_at,
        verified_by = excluded.verified_by,
        verified_at = excluded.verified_at,
        closed_at = excluded.closed_at,
        updated_at = excluded.updated_at`,
      [
        ncr.id, ncr.tenantId, ncr.companyId, ncr.projectId, ncr.projectName, ncr.ncrNumber, ncr.description,
        ncr.rootCause, ncr.correctiveAction, ncr.severity, ncr.status, ncr.raisedBy, ncr.assignedTo,
        ncr.sourceIrId, ncr.sourceIrNumber, ncr.actionPlannedAt, ncr.correctedBy, ncr.correctedAt,
        ncr.verifiedBy, ncr.verifiedAt, ncr.closedAt, ncr.createdAt, ncr.updatedAt,
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

  async listPaged(tenantId: string, page: PageParams): Promise<Page<Ncr>> {
    const countRes = await this.pool.query<{ count: number }>(
      `select count(*)::int as count from public.aura_quality_ncrs where tenant_id = $1`, [tenantId]);
    const res = await this.pool.query(
      `select * from public.aura_quality_ncrs where tenant_id = $1 order by created_at desc limit $2 offset $3`,
      [tenantId, page.limit, page.offset]);
    return makePage(res.rows.map(this.mapNcr), Number(countRes.rows[0]?.count ?? 0), page);
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
      correctiveAction: row.proposed_correction,
      severity: row.severity,
      status: row.status,
      raisedBy: row.raised_by,
      assignedTo: row.assigned_to,
      sourceIrId: row.source_ir_id ?? null,
      sourceIrNumber: row.source_ir_number ?? null,
      actionPlannedAt: iso(row.action_planned_at),
      correctedBy: row.corrected_by ?? null,
      correctedAt: iso(row.corrected_at),
      verifiedBy: row.verified_by ?? null,
      verifiedAt: iso(row.verified_at),
      closedAt: iso(row.closed_at),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
