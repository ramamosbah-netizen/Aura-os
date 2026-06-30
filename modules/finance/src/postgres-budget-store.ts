import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { Budget, BudgetLine } from './domain/budget';
import type { BudgetStore } from './budget-store';

interface Row {
  id: string;
  tenant_id: string;
  name: string;
  from_date: string;
  to_date: string;
  lines: BudgetLine[] | string;
  created_at: Date;
  created_by: string | null;
}

const COLS = 'id, tenant_id, name, from_date::text, to_date::text, lines, created_at, created_by';

function toBudget(r: Row): Budget {
  const lines = typeof r.lines === 'string' ? (JSON.parse(r.lines) as BudgetLine[]) : r.lines;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    from: r.from_date,
    to: r.to_date,
    lines: lines ?? [],
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
      `SELECT ${COLS} FROM public.aura_finance_budgets WHERE id = $1`,
      [id],
    );
    return res.rows.length ? toBudget(res.rows[0]) : null;
  }

  async list(tenantId: string): Promise<Budget[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_budgets WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return res.rows.map(toBudget);
  }

  async remove(id: Id): Promise<void> {
    await this.pool.query(`DELETE FROM public.aura_finance_budgets WHERE id = $1`, [id]);
  }
}
