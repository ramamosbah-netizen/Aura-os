import type { Pool } from 'pg';
import type { Id, ForecastSnapshot } from '@aura/shared';
import type { ForecastSnapshotStore } from './forecast-snapshot-store';

interface Row {
  id: string;
  batch_id: string;
  tenant_id: string;
  company_id: string | null;
  taken_at: Date;
  period: string;
  open_value: string;
  weighted_value: string;
  committed_value: string;
  deal_count: number;
  created_at: Date;
}

const COLS = 'id, batch_id, tenant_id, company_id, taken_at, period, open_value, weighted_value, committed_value, deal_count, created_at';

function rowTo(r: Row): ForecastSnapshot {
  return {
    id: r.id,
    batchId: r.batch_id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    takenAt: r.taken_at.toISOString(),
    period: r.period,
    openValue: Number(r.open_value),
    weightedValue: Number(r.weighted_value),
    committedValue: Number(r.committed_value),
    dealCount: r.deal_count,
    createdAt: r.created_at.toISOString(),
  };
}

export class PostgresForecastSnapshotStore implements ForecastSnapshotStore {
  constructor(private readonly pool: Pool) {}

  async saveBatch(rows: ForecastSnapshot[]): Promise<void> {
    if (rows.length === 0) return;
    const values: string[] = [];
    const params: unknown[] = [];
    rows.forEach((r, i) => {
      const b = i * 11;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`);
      params.push(r.id, r.batchId, r.tenantId, r.companyId, r.takenAt, r.period, r.openValue, r.weightedValue, r.committedValue, r.dealCount, r.createdAt);
    });
    await this.pool.query(`INSERT INTO public.aura_crm_forecast_snapshots (${COLS}) VALUES ${values.join(',')}`, params);
  }

  async recentBatches(tenantId: Id, limit: number): Promise<ForecastSnapshot[][]> {
    // Pick the N most-recent capture batches, then fetch all their period rows in one pass.
    const batchRes = await this.pool.query<{ batch_id: string }>(
      `SELECT batch_id FROM public.aura_crm_forecast_snapshots
       WHERE tenant_id = $1
       GROUP BY batch_id
       ORDER BY MAX(taken_at) DESC
       LIMIT $2`,
      [tenantId, limit],
    );
    const batchIds = batchRes.rows.map((r) => r.batch_id);
    if (batchIds.length === 0) return [];

    const rowsRes = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_forecast_snapshots WHERE batch_id = ANY($1)`,
      [batchIds],
    );
    // Preserve the recency order established above.
    const byBatch = new Map<string, ForecastSnapshot[]>();
    for (const r of rowsRes.rows) {
      const list = byBatch.get(r.batch_id) ?? [];
      list.push(rowTo(r));
      byBatch.set(r.batch_id, list);
    }
    return batchIds.map((id) => byBatch.get(id) ?? []);
  }
}
