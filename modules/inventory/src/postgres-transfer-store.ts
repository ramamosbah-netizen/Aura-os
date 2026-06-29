import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { StockTransfer } from './domain/stock-transfer';
import type { TransferFilter, TransferStore } from './transfer-store';

interface Row {
  id: string;
  tenant_id: string;
  source_item_id: string;
  dest_item_id: string;
  quantity: string | number;
  reason: string;
  status: string;
  created_at: Date | string;
  completed_at: Date | string | null;
}

const COLS = 'id, tenant_id, source_item_id, dest_item_id, quantity, reason, status, created_at, completed_at';
const iso = (v: Date | string | null): string | null => (v === null ? null : v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): StockTransfer {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    sourceItemId: r.source_item_id,
    destItemId: r.dest_item_id,
    quantity: Number(r.quantity),
    reason: r.reason,
    status: r.status as StockTransfer['status'],
    createdAt: iso(r.created_at)!,
    completedAt: iso(r.completed_at),
  };
}

export class PostgresTransferStore implements TransferStore {
  constructor(private readonly pool: Pool) {}

  async save(t: StockTransfer): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_inventory_stock_transfers (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, completed_at = EXCLUDED.completed_at`,
      [t.id, t.tenantId, t.sourceItemId, t.destItemId, t.quantity, t.reason, t.status, t.createdAt, t.completedAt],
    );
  }

  async get(id: Id): Promise<StockTransfer | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_inventory_stock_transfers WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: TransferFilter = {}): Promise<StockTransfer[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_inventory_stock_transfers ${w} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }
}
