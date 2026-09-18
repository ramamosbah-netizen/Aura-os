import type { Pool } from 'pg';
import type { PeriodClose } from './domain/period-close';
import type { PeriodCloseStore } from './period-close-store';

interface Row {
  id: string;
  tenant_id: string;
  period: string;
  generation: number;
  closed_at: Date;
  closed_by: string | null;
  note: string | null;
  reopened_by: string | null;
  reopened_at: Date | null;
  reopen_reason: string | null;
}

// Shared by SELECT and INSERT. Names are APPENDED, never inserted mid-list: the placeholders below
// are positional, so a name added in the middle silently writes a different column.
const COLS =
  'id, tenant_id, period, closed_at, closed_by, note, generation, reopened_by, reopened_at, reopen_reason';

function toClose(r: Row): PeriodClose {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    period: r.period,
    generation: Number(r.generation),
    closedAt: r.closed_at.toISOString(),
    closedBy: r.closed_by,
    note: r.note,
    reopenedBy: r.reopened_by,
    reopenedAt: r.reopened_at ? r.reopened_at.toISOString() : null,
    reopenReason: r.reopen_reason,
  };
}

export class PostgresPeriodCloseStore implements PeriodCloseStore {
  constructor(private readonly pool: Pool) {}

  /**
   * Writes a generation, or the reopen metadata onto one. The conflict target is the GENERATION, not
   * the period: (tenant, period) used to be unique, which is precisely what forced reopening to be a
   * DELETE. `closed_at`, `closed_by` and `generation` are left out of the update on purpose — a
   * reopen must not be able to restate who closed the books or when, which is the fact it is being
   * checked against.
   */
  async save(c: PeriodClose): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_period_closes (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, period, generation) DO UPDATE SET
         note = EXCLUDED.note,
         reopened_by = EXCLUDED.reopened_by,
         reopened_at = EXCLUDED.reopened_at,
         reopen_reason = EXCLUDED.reopen_reason`,
      [c.id, c.tenantId, c.period, c.closedAt, c.closedBy, c.note,
       c.generation, c.reopenedBy, c.reopenedAt, c.reopenReason],
    );
  }

  /** The generation holding this period closed right now — the one nobody reopened. */
  async findByPeriod(tenantId: string, period: string): Promise<PeriodClose | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_period_closes
       WHERE tenant_id = $1 AND period = $2 AND reopened_at IS NULL`,
      [tenantId, period],
    );
    return res.rows.length ? toClose(res.rows[0]) : null;
  }

  async history(tenantId: string, period: string): Promise<PeriodClose[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_period_closes
       WHERE tenant_id = $1 AND period = $2 ORDER BY generation DESC`,
      [tenantId, period],
    );
    return res.rows.map(toClose);
  }

  /** The register: one row per period, the state it is in now. */
  async list(tenantId: string): Promise<PeriodClose[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_period_closes
       WHERE tenant_id = $1 AND reopened_at IS NULL ORDER BY period DESC`,
      [tenantId],
    );
    return res.rows.map(toClose);
  }

  async listAll(tenantId: string): Promise<PeriodClose[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_period_closes
       WHERE tenant_id = $1 ORDER BY period DESC, generation DESC`,
      [tenantId],
    );
    return res.rows.map(toClose);
  }
}
