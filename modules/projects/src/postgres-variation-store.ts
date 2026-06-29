import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { VariationOrder } from './domain/variation';
import type { VariationFilter, VariationStore } from './variation-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  project_id: string;
  project_title: string | null;
  reference: string | null;
  title: string;
  description: string | null;
  type: string;
  amount: string | number;
  signed_amount: string | number;
  status: string;
  created_by: string | null;
  decided_by: string | null;
  decided_at: Date | string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, project_id, project_title, reference, title, description, type, amount, signed_amount, status, created_by, decided_by, decided_at, created_at';

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: Date | string | null): string | null => (v == null ? null : iso(v));

function rowToVariation(r: Row): VariationOrder {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    projectId: r.project_id,
    projectTitle: r.project_title,
    reference: r.reference,
    title: r.title,
    description: r.description,
    type: r.type as VariationOrder['type'],
    amount: Number(r.amount),
    signedAmount: Number(r.signed_amount),
    status: r.status as VariationOrder['status'],
    createdBy: r.created_by,
    decidedBy: r.decided_by,
    decidedAt: isoOrNull(r.decided_at),
    createdAt: iso(r.created_at),
  };
}

/** Durable variation orders on Postgres (`aura_projects_variations`). */
export class PostgresVariationStore implements VariationStore {
  constructor(private readonly pool: Pool) {}

  async create(v: VariationOrder): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_variations (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [v.id, v.tenantId, v.companyId, v.projectId, v.projectTitle, v.reference, v.title, v.description, v.type, v.amount, v.signedAmount, v.status, v.createdBy, v.decidedBy, v.decidedAt, v.createdAt],
    );
  }

  async update(v: VariationOrder): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_variations SET status=$2, decided_by=$3, decided_at=$4 WHERE id=$1`,
      [v.id, v.status, v.decidedBy, v.decidedAt],
    );
  }

  async get(id: Id): Promise<VariationOrder | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_projects_variations WHERE id = $1`, [id]);
    return res.rows.length ? rowToVariation(res.rows[0]) : null;
  }

  async list(filter: VariationFilter = {}): Promise<VariationOrder[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_variations ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToVariation);
  }
}
