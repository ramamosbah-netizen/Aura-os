import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { ElvSystem } from '@aura/shared';
import type { ItpTemplate } from './domain/itp-template';
import type { ItpPoint } from './domain/itp';
import type { ItpTemplateStore } from './store.interface';

const COLS = 'id, tenant_id, company_id, system, version, title, status, points, created_by, published_by, published_at, retired_by, retired_at, created_at, updated_at';

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

/** The tenant library (migration 0388). Published versions are frozen by the table's own trigger. */
export class PostgresItpTemplateStore implements ItpTemplateStore {
  constructor(private readonly pool: Pool) {}

  async save(t: ItpTemplate, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_itp_templates (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
       on conflict (id) do update set
         title = excluded.title, status = excluded.status, points = excluded.points,
         published_by = excluded.published_by, published_at = excluded.published_at,
         retired_by = excluded.retired_by, retired_at = excluded.retired_at, updated_at = excluded.updated_at`,
      [t.id, t.tenantId, t.companyId, t.system, t.version, t.title, t.status, JSON.stringify(t.points), t.createdBy,
        t.publishedBy, t.publishedAt, t.retiredBy, t.retiredAt, t.createdAt, t.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<ItpTemplate | null> {
    const res = await this.pool.query(`select ${COLS} from public.aura_quality_itp_templates where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : toTemplate(res.rows[0]);
  }

  async list(tenantId: string, system?: ElvSystem): Promise<ItpTemplate[]> {
    const params: unknown[] = [tenantId];
    let where = 'tenant_id = $1';
    if (system) { params.push(system); where += ` and system = $${params.length}`; }
    const res = await this.pool.query(`select ${COLS} from public.aura_quality_itp_templates where ${where} order by system, version desc`, params);
    return res.rows.map(toTemplate);
  }
}

function toTemplate(row: QueryResultRow): ItpTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    companyId: row.company_id ?? null,
    system: row.system,
    version: Number(row.version),
    title: row.title,
    status: row.status,
    points: (typeof row.points === 'string' ? JSON.parse(row.points) : row.points) as ItpPoint[],
    createdBy: row.created_by ?? null,
    publishedBy: row.published_by ?? null,
    publishedAt: iso(row.published_at),
    retiredBy: row.retired_by ?? null,
    retiredAt: iso(row.retired_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}
