import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { CostCenter } from './domain/cost-center';
import type { CostCenterStore } from './cost-center-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  name: string;
  active: boolean;
  created_by: string | null;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, code, name, active, created_by, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToCc(r: Row): CostCenter {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    name: r.name,
    active: r.active,
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

export class PostgresCostCenterStore implements CostCenterStore {
  constructor(private readonly pool: Pool) {}

  async save(cc: CostCenter): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_cost_centers (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, active = excluded.active`,
      [cc.id, cc.tenantId, cc.companyId, cc.code, cc.name, cc.active, cc.createdBy, cc.createdAt],
    );
  }

  async get(id: Id): Promise<CostCenter | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_cost_centers WHERE id = $1`, [id]);
    return res.rows.length ? rowToCc(res.rows[0]) : null;
  }

  async list(tenantId: string): Promise<CostCenter[]> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_cost_centers WHERE tenant_id = $1 ORDER BY code ASC`, [tenantId]);
    return res.rows.map(rowToCc);
  }
}
