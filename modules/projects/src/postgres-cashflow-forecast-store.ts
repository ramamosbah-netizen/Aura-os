import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ProjectCashflowForecast, CashflowPeriod } from './domain/cashflow-forecast';
import type { CashflowForecastStore } from './cashflow-forecast-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  project_id: string;
  project_name: string | null;
  periods: unknown;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, project_id, project_name, periods, notes, created_by, created_at, updated_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): ProjectCashflowForecast {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    projectId: r.project_id,
    projectName: r.project_name,
    periods: (typeof r.periods === 'string' ? JSON.parse(r.periods) : r.periods) as CashflowPeriod[],
    notes: r.notes ?? '',
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export class PostgresCashflowForecastStore implements CashflowForecastStore {
  constructor(private readonly pool: Pool) {}

  async create(f: ProjectCashflowForecast): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_cashflow_forecasts
        (id, tenant_id, company_id, project_id, project_name, periods, notes, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
      [f.id, f.tenantId, f.companyId, f.projectId, f.projectName, JSON.stringify(f.periods), f.notes, f.createdBy, f.createdAt, f.updatedAt],
    );
  }

  async update(f: ProjectCashflowForecast): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_cashflow_forecasts SET periods=$2::jsonb, notes=$3, updated_at=$4 WHERE id=$1`,
      [f.id, JSON.stringify(f.periods), f.notes, f.updatedAt],
    );
  }

  async get(id: Id): Promise<ProjectCashflowForecast | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_projects_cashflow_forecasts WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async getByProject(tenantId: Id, projectId: Id): Promise<ProjectCashflowForecast | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_cashflow_forecasts WHERE tenant_id = $1 AND project_id = $2`,
      [tenantId, projectId],
    );
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(tenantId: Id): Promise<ProjectCashflowForecast[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_cashflow_forecasts WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [tenantId],
    );
    return res.rows.map(rowTo);
  }
}
