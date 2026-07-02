import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { Budget, BudgetLine } from './domain/budget';
import type { BudgetStore } from './budget-store';

interface Row {
  id: string;
  tenant_id: string;
  name: string;
  from_date: string;
  to_date: string;
  lines: BudgetLine[] | string;
  deleted_at: Date | null;
  created_at: Date;
  created_by: string | null;
}

const COLS = 'id, tenant_id, name, from_date::text, to_date::text, lines, deleted_at, created_at, created_by';

function toBudget(r: Row): Budget {
  const lines = typeof r.lines === 'string' ? (JSON.parse(r.lines) as BudgetLine[]) : r.lines;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    from: r.from_date,
    to: r.to_date,
    lines: lines ?? [],
    deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
  };
}

export class PostgresBudgetStore implements BudgetStore {
  constructor(private readonly pool: Pool) {}

  async save(b: Budget): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_budgets (id, tenant_id, name, from_date, to_date, lines, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, from_date = EXCLUDED.from_date, to_date = EXCLUDED.to_date,
         lines = EXCLUDED.lines`,
      [b.id, b.tenantId, b.name, b.from, b.to, JSON.stringify(b.lines), b.createdAt, b.createdBy],
    );
  }

  async get(id: Id): Promise<Budget | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_budgets WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return res.rows.length ? toBudget(res.rows[0]) : null;
  }

  async list(tenantId: string): Promise<Budget[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_budgets WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [tenantId],
    );
    return res.rows.map(toBudget);
  }

  async listPaged(tenantId: string, page: PageParams): Promise<Page<Budget>> {
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_finance_budgets WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_budgets WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [tenantId, page.limit, page.offset],
    );
    return makePage(res.rows.map(toBudget), total, page);
  }

  async setDeleted(id: Id, deleted: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_finance_budgets SET deleted_at = ${deleted ? 'now()' : 'NULL'} WHERE id = $1`,
      [id],
    );
  }
}
