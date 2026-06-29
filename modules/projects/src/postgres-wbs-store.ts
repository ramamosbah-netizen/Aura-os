import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { WbsNode } from './domain/wbs';
import type { WbsNodeFilter, WbsStore } from './wbs-store';

interface Row {
  id: string;
  tenant_id: string;
  project_id: string;
  parent_id: string | null;
  code: string;
  title: string;
  planned_value: string | number;
  earned_value: string | number;
  actual_cost: string | number;
  progress: string | number;
  status: string;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, project_id, parent_id, code, title, planned_value, earned_value, actual_cost, progress, status, created_at';

function rowToNode(r: Row): WbsNode {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    projectId: r.project_id,
    parentId: r.parent_id,
    code: r.code,
    title: r.title,
    plannedValue: Number(r.planned_value),
    earnedValue: Number(r.earned_value),
    actualCost: Number(r.actual_cost),
    progress: Number(r.progress),
    status: r.status as WbsNode['status'],
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresWbsStore implements WbsStore {
  constructor(private readonly pool: Pool) {}

  async create(n: WbsNode): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_wbs_nodes (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        n.id,
        n.tenantId,
        n.projectId,
        n.parentId,
        n.code,
        n.title,
        n.plannedValue,
        n.earnedValue,
        n.actualCost,
        n.progress,
        n.status,
        n.createdAt,
      ],
    );
  }

  async update(n: WbsNode): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_wbs_nodes SET code=$2, title=$3, planned_value=$4, earned_value=$5, actual_cost=$6, progress=$7, status=$8 WHERE id=$1`,
      [n.id, n.code, n.title, n.plannedValue, n.earnedValue, n.actualCost, n.progress, n.status],
    );
  }

  async get(id: Id): Promise<WbsNode | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_wbs_nodes WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToNode(res.rows[0]) : null;
  }

  async list(filter: WbsNodeFilter = {}): Promise<WbsNode[]> {
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
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    if (filter.parentId !== undefined) {
      add('parent_id', filter.parentId);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_wbs_nodes ${whereSql} ORDER BY code ASC`,
      params,
    );
    return res.rows.map(rowToNode);
  }
}
