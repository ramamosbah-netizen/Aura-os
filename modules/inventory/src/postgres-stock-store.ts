import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { StockItem, StockMovement } from './domain/stock';
import type { StockFilter, StockStore } from './stock-store';

interface ItemRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  name: string;
  unit: string;
  warehouse: string;
  quantity_on_hand: string | number;
  created_by: string | null;
  created_at: Date | string;
}

interface MoveRow {
  id: string;
  tenant_id: string;
  stock_item_id: string;
  direction: string;
  quantity: string | number;
  reason: string;
  balance_after: string | number;
  created_at: Date | string;
}

const ITEM_COLS = 'id, tenant_id, company_id, code, name, unit, warehouse, quantity_on_hand, created_by, created_at';
const MOVE_COLS = 'id, tenant_id, stock_item_id, direction, quantity, reason, balance_after, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToItem(r: ItemRow): StockItem {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    name: r.name,
    unit: r.unit,
    warehouse: r.warehouse,
    quantityOnHand: Number(r.quantity_on_hand),
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

function rowToMove(r: MoveRow): StockMovement {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    stockItemId: r.stock_item_id,
    direction: r.direction as StockMovement['direction'],
    quantity: Number(r.quantity),
    reason: r.reason,
    balanceAfter: Number(r.balance_after),
    createdAt: iso(r.created_at),
  };
}

/** Durable stock on Postgres (`aura_inventory_stock_items`, `aura_inventory_stock_movements`). */
export class PostgresStockStore implements StockStore {
  constructor(private readonly pool: Pool) {}

  async createItem(i: StockItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_inventory_stock_items (${ITEM_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [i.id, i.tenantId, i.companyId, i.code, i.name, i.unit, i.warehouse, i.quantityOnHand, i.createdBy, i.createdAt],
    );
  }

  async updateItem(i: StockItem): Promise<void> {
    await this.pool.query(`UPDATE public.aura_inventory_stock_items SET quantity_on_hand=$2, name=$3, unit=$4, warehouse=$5 WHERE id=$1`, [
      i.id,
      i.quantityOnHand,
      i.name,
      i.unit,
      i.warehouse,
    ]);
  }

  async getItem(id: Id): Promise<StockItem | null> {
    const res = await this.pool.query<ItemRow>(`SELECT ${ITEM_COLS} FROM public.aura_inventory_stock_items WHERE id = $1`, [id]);
    return res.rows.length ? rowToItem(res.rows[0]) : null;
  }

  async getItemByCode(tenantId: Id, code: string): Promise<StockItem | null> {
    const res = await this.pool.query<ItemRow>(
      `SELECT ${ITEM_COLS} FROM public.aura_inventory_stock_items WHERE tenant_id = $1 AND code = $2`,
      [tenantId, code],
    );
    return res.rows.length ? rowToItem(res.rows[0]) : null;
  }

  async listItems(filter: StockFilter = {}): Promise<StockItem[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('warehouse', filter.warehouse);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<ItemRow>(
      `SELECT ${ITEM_COLS} FROM public.aura_inventory_stock_items ${whereSql} ORDER BY code ASC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToItem);
  }

  async addMovement(m: StockMovement): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_inventory_stock_movements (${MOVE_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [m.id, m.tenantId, m.stockItemId, m.direction, m.quantity, m.reason, m.balanceAfter, m.createdAt],
    );
  }

  async listMovements(stockItemId: Id): Promise<StockMovement[]> {
    const res = await this.pool.query<MoveRow>(
      `SELECT ${MOVE_COLS} FROM public.aura_inventory_stock_movements WHERE stock_item_id = $1 ORDER BY created_at DESC`,
      [stockItemId],
    );
    return res.rows.map(rowToMove);
  }
}
