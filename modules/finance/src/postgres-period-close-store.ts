import type { Pool } from 'pg';
import type { PeriodClose } from './domain/period-close';
import type { PeriodCloseStore } from './period-close-store';

interface Row {
  id: string;
  tenant_id: string;
  period: string;
  closed_at: Date;
  closed_by: string | null;
  note: string | null;
}

const COLS = 'id, tenant_id, period, closed_at, closed_by, note';

function toClose(r: Row): PeriodClose {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    period: r.period,
    closedAt: r.closed_at.toISOString(),
    closedBy: r.closed_by,
    note: r.note,
  };
}

export class PostgresPeriodCloseStore implements PeriodCloseStore {
  constructor(private readonly pool: Pool) {}

  async save(c: PeriodClose): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_period_closes (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, period) DO UPDATE SET
         closed_at = EXCLUDED.closed_at, closed_by = EXCLUDED.closed_by, note = EXCLUDED.note`,
      [c.id, c.tenantId, c.period, c.closedAt, c.closedBy, c.note],
    );
  }

  async findByPeriod(tenantId: string, period: string): Promise<PeriodClose | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_period_closes WHERE tenant_id = $1 AND period = $2`,
      [tenantId, period],
    );
    return res.rows.length ? toClose(res.rows[0]) : null;
  }

  async list(tenantId: string): Promise<PeriodClose[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_period_closes WHERE tenant_id = $1 ORDER BY period DESC`,
      [tenantId],
    );
    return res.rows.map(toClose);
  }

  async remove(tenantId: string, period: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM public.aura_finance_period_closes WHERE tenant_id = $1 AND period = $2`,
      [tenantId, period],
    );
  }
}
