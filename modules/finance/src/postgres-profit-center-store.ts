import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ProfitCenter } from './domain/profit-center';
import type { ProfitCenterStore } from './profit-center-store';

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

function rowToPc(r: Row): ProfitCenter {
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

export class PostgresProfitCenterStore implements ProfitCenterStore {
  constructor(private readonly pool: Pool) {}

  async save(pc: ProfitCenter): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_profit_centers (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, active = excluded.active`,
      [pc.id, pc.tenantId, pc.companyId, pc.code, pc.name, pc.active, pc.createdBy, pc.createdAt],
    );
  }

  async get(id: Id): Promise<ProfitCenter | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_profit_centers WHERE id = $1`, [id]);
    return res.rows.length ? rowToPc(res.rows[0]) : null;
  }

  async list(tenantId: string): Promise<ProfitCenter[]> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_profit_centers WHERE tenant_id = $1 ORDER BY code ASC`, [tenantId]);
    return res.rows.map(rowToPc);
  }
}
