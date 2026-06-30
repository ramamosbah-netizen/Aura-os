import { type Id, newId } from '@aura/shared';

/**
 * Stock — the on-hand side of Inventory (GRNs record *receipts against POs*; stock tracks
 * what's actually held). A StockItem is an SKU at a warehouse with a running on-hand
 * quantity; every StockMovement (in/out) adjusts it. Issues can't drive on-hand negative.
 */
export interface StockItem {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  name: string;
  unit: string;
  warehouse: string;
  quantityOnHand: number;
  /** Moving-average (weighted-average) unit cost — the basis for valuation & COGS. */
  avgCost: number;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewStockItem {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  name: string;
  unit?: string;
  warehouse?: string;
  openingQty?: number;
  /** Unit cost of the opening quantity (seeds the moving average). */
  openingCost?: number;
  createdBy?: Id | null;
}

export function makeStockItem(input: NewStockItem): StockItem {
  if (!input.code || !input.code.trim()) throw new Error('stock item code is required');
  if (!input.name || !input.name.trim()) throw new Error('stock item name is required');
  const opening = Number(input.openingQty);
  if (input.openingQty !== undefined && (!Number.isFinite(opening) || opening < 0)) {
    throw new Error('opening quantity cannot be negative');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    name: input.name.trim(),
    unit: input.unit?.trim() || 'pcs',
    warehouse: input.warehouse?.trim() || 'Main',
    quantityOnHand: Number.isFinite(opening) ? opening : 0,
    avgCost: Number.isFinite(Number(input.openingCost)) && Number(input.openingCost) >= 0 ? Number(input.openingCost) : 0,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export type StockDirection = 'in' | 'out';

export interface StockMovement {
  id: Id;
  tenantId: Id;
  stockItemId: Id;
  direction: StockDirection;
  quantity: number;
  reason: string;
  balanceAfter: number;
  /** Unit cost: the receipt cost for an 'in'; the avg cost charged out for an 'out'. */
  unitCost: number;
  /** Cost of goods issued (out movements): quantity × avg cost at issue time. 0 for 'in'. */
  cogs: number;
  createdAt: string;
}

export interface NewStockMovement {
  stockItemId: Id;
  tenantId: Id;
  direction: StockDirection;
  quantity: number;
  reason?: string;
  unitCost?: number;
  cogs?: number;
}

/**
 * Moving-average (weighted-average cost) valuation for a movement.
 *  - 'in':  new avg = (onHand·avg + qty·unitCost) / (onHand+qty); no COGS.
 *  - 'out': COGS = qty · avg; avg unchanged; the unit cost charged out is the avg.
 */
export function valueMovement(
  onHand: number,
  avgCost: number,
  direction: StockDirection,
  quantity: number,
  unitCost = 0,
): { balanceAfter: number; avgCost: number; unitCost: number; cogs: number } {
  const balanceAfter = applyMovement(onHand, direction, quantity);
  const r2 = (n: number): number => Math.round(n * 100) / 100;
  const r4 = (n: number): number => Math.round(n * 10000) / 10000;
  if (direction === 'in') {
    const uc = Number(unitCost) || 0;
    const denom = onHand + quantity;
    const newAvg = denom > 0 ? (onHand * avgCost + quantity * uc) / denom : uc;
    return { balanceAfter, avgCost: r4(newAvg), unitCost: r4(uc), cogs: 0 };
  }
  return { balanceAfter, avgCost: r4(avgCost), unitCost: r4(avgCost), cogs: r2(quantity * avgCost) };
}

/** Compute the new on-hand after applying a movement; throws if an issue would go negative. */
export function applyMovement(onHand: number, direction: StockDirection, quantity: number): number {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) throw new Error('movement quantity must be positive');
  const next = direction === 'in' ? onHand + q : onHand - q;
  if (next < 0) throw new Error(`insufficient stock: on-hand ${onHand}, issue ${q}`);
  return next;
}

export function makeStockMovement(input: NewStockMovement, balanceAfter: number): StockMovement {
  return {
    id: newId(),
    tenantId: input.tenantId,
    stockItemId: input.stockItemId,
    direction: input.direction,
    quantity: Number(input.quantity),
    reason: input.reason?.trim() || (input.direction === 'in' ? 'receipt' : 'issue'),
    balanceAfter,
    unitCost: Number(input.unitCost) || 0,
    cogs: Number(input.cogs) || 0,
    createdAt: new Date().toISOString(),
  };
}

export const STOCK_EVENT = {
  itemCreated: 'inventory.stock.item_created',
  movementRecorded: 'inventory.stock.movement_recorded',
} as const;
