import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { ContractClause } from './domain/contract-clause';
import type { ClauseFilter, ClauseStore } from './clause-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  title: string;
  category: string;
  body: string;
  tags: unknown;
  revision: number;
  active: boolean;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, code, title, category, body, tags, revision, active, created_by, created_at, updated_at';

function rowToClause(r: Row): ContractClause {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    title: r.title,
    category: r.category as ContractClause['category'],
    body: r.body,
    tags: (typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags ?? [])) as string[],
    revision: Number(r.revision),
    active: r.active,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export class PostgresClauseStore implements ClauseStore {
  constructor(private readonly pool: Pool) {}

  async save(c: ContractClause): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_contracts_clauses (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, category = EXCLUDED.category, body = EXCLUDED.body, tags = EXCLUDED.tags,
         revision = EXCLUDED.revision, active = EXCLUDED.active, updated_at = EXCLUDED.updated_at`,
      [c.id, c.tenantId, c.companyId, c.code, c.title, c.category, c.body, JSON.stringify(c.tags), c.revision, c.active, c.createdBy, c.createdAt, c.updatedAt],
    );
  }

  async get(id: Id): Promise<ContractClause | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_contracts_clauses WHERE id = $1`, [id]);
    return res.rows.length ? rowToClause(res.rows[0]) : null;
  }

  private buildWhere(filter: ClauseFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.tenantId) { params.push(filter.tenantId); where.push(`tenant_id = $${params.length}`); }
    if (filter.category) { params.push(filter.category); where.push(`category = $${params.length}`); }
    if (filter.active !== undefined) { params.push(filter.active); where.push(`active = $${params.length}`); }
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: ClauseFilter = {}): Promise<ContractClause[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contracts_clauses ${whereSql} ORDER BY code ASC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToClause);
  }

  async listPaged(filter: ClauseFilter, page: PageParams): Promise<Page<ContractClause>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_contracts_clauses ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contracts_clauses ${whereSql} ORDER BY code ASC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToClause), total, page);
  }
}
