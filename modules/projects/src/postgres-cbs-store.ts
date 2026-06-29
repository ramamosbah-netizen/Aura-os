import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { CbsNode, CbsCategory } from './domain/cbs';
import type { CbsNodeFilter, CbsStore } from './cbs-store';

interface Row {
  id: string;
  tenant_id: string;
  project_id: string;
  parent_id: string | null;
  code: string;
  title: string;
  category: string;
  budget_amount: string | number;
  committed_amount: string | number;
  actual_amount: string | number;
  forecast_amount: string | number;
  variance: string | number;
  currency: string;
  notes: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, project_id, parent_id, code, title, category, budget_amount, committed_amount, actual_amount, forecast_amount, variance, currency, notes, created_at';

function rowToNode(r: Row): CbsNode {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    projectId: r.project_id,
    parentId: r.parent_id,
    code: r.code,
    title: r.title,
    category: r.category as CbsCategory,
    budgetAmount: Number(r.budget_amount),
    committedAmount: Number(r.committed_amount),
    actualAmount: Number(r.actual_amount),
    forecastAmount: Number(r.forecast_amount),
    variance: Number(r.variance),
    currency: r.currency,
    notes: r.notes,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresCbsStore implements CbsStore {
  constructor(private readonly pool: Pool) {}

  async create(n: CbsNode): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_cbs_nodes
        (id, tenant_id, project_id, parent_id, code, title, category, budget_amount, committed_amount, actual_amount, forecast_amount, currency, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        n.id, n.tenantId, n.projectId, n.parentId, n.code, n.title,
        n.category, n.budgetAmount, n.committedAmount, n.actualAmount,
        n.forecastAmount, n.currency, n.notes, n.createdAt,
      ],
    );
  }

  async update(n: CbsNode): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_cbs_nodes
       SET code=$2, title=$3, category=$4, budget_amount=$5, committed_amount=$6,
           actual_amount=$7, forecast_amount=$8, currency=$9, notes=$10
       WHERE id=$1`,
      [n.id, n.code, n.title, n.category, n.budgetAmount, n.committedAmount,
       n.actualAmount, n.forecastAmount, n.currency, n.notes],
    );
  }

  async get(id: Id): Promise<CbsNode | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_cbs_nodes WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToNode(res.rows[0]) : null;
  }

  async list(filter: CbsNodeFilter = {}): Promise<CbsNode[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string | null): void => {
      if (val !== undefined) {
        if (val === null) {
          where.push(`${col} IS NULL`);
        } else {
          params.push(val);
          where.push(`${col} = $${params.length}`);
        }
      }
    };
    add('project_id', filter.projectId);
    if (filter.parentId !== undefined) add('parent_id', filter.parentId);
    if (filter.category) add('category', filter.category);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_cbs_nodes ${whereSql} ORDER BY code ASC`,
      params,
    );
    return res.rows.map(rowToNode);
  }

  async delete(id: Id): Promise<void> {
    await this.pool.query('DELETE FROM public.aura_projects_cbs_nodes WHERE id = $1', [id]);
  }
}
