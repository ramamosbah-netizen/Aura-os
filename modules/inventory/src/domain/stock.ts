import { type Id, newId } from '@aura/shared';

/**
 * Stock — the on-hand side of Inventory (GRNs record *receipts against POs*; stock tracks
 * what's actually held). A StockItem is an SKU at a warehouse with a running on-hand
 * quantity; every StockMovement (in/out) adjusts it. Issues can't drive on-hand negative.
 */
/** An alternative unit of measure: 1 <unit> = <factor> base units (e.g. 1 box = 12 pcs). */
export interface UomConversion {
  unit: string;
  factor: number;
}

export interface StockItem {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  name: string;
  unit: string;
  /** Scannable barcode (EAN/Code128/QR payload) — unique per tenant when set. */
  barcode: string | null;
  /** Alternative UOMs; quantities entered in these convert to the base unit. */
  altUnits: UomConversion[];
  warehouse: string;
  quantityOnHand: number;
  /** Moving weighted-average unit cost (WAC); inventory value = quantityOnHand × avgCost.
   * For FIFO items this holds the running FIFO average of remaining layers (fifoValue / onHand). */
  avgCost: number;
  /** Costing method for issue valuation + COGS posting: 'wac' (moving average) or 'fifo' (cost layers). */
  costingMethod: CostingMethod;
  /** Replenishment trigger: when on-hand ≤ reorderLevel the item needs reordering (0 = no policy). */
  reorderLevel: number;
  /** Suggested reorder quantity when triggered (0 = unset → suggestion falls back to topping up to reorderLevel). */
  reorderQty: number;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewStockItem {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  name: string;
  unit?: string;
  barcode?: string | null;
  altUnits?: UomConversion[];
  warehouse?: string;
  openingQty?: number;
  openingCost?: number;
  reorderLevel?: number;
  reorderQty?: number;
  costingMethod?: CostingMethod;
  createdBy?: Id | null;
}

export type CostingMethod = 'wac' | 'fifo';

/** Validate + normalise a set of alternative UOMs against the base unit. */
export function normaliseAltUnits(baseUnit: string, altUnits: UomConversion[] | undefined): UomConversion[] {
  const seen = new Set<string>([baseUnit.toLowerCase()]);
  return (altUnits ?? []).map((u) => {
    const unit = u.unit?.trim();
    const factor = Number(u.factor);
    if (!unit) throw new Error('alt unit name is required');
    if (seen.has(unit.toLowerCase())) throw new Error(`duplicate unit "${unit}"`);
    seen.add(unit.toLowerCase());
    if (!Number.isFinite(factor) || factor <= 0) throw new Error(`alt unit "${unit}" needs a positive factor`);
    return { unit, factor };
  });
}

export function makeStockItem(input: NewStockItem): StockItem {
  if (!input.code || !input.code.trim()) throw new Error('stock item code is required');
  if (!input.name || !input.name.trim()) throw new Error('stock item name is required');
  const opening = Number(input.openingQty);
  if (input.openingQty !== undefined && (!Number.isFinite(opening) || opening < 0)) {
    throw new Error('opening quantity cannot be negative');
  }
  const unit = input.unit?.trim() || 'pcs';
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    name: input.name.trim(),
    unit,
    barcode: input.barcode?.trim() || null,
    altUnits: normaliseAltUnits(unit, input.altUnits),
    warehouse: input.warehouse?.trim() || 'Main',
    quantityOnHand: Number.isFinite(opening) ? opening : 0,
    avgCost: Math.max(0, Number(input.openingCost) || 0),
    reorderLevel: Math.max(0, Number(input.reorderLevel) || 0),
    reorderQty: Math.max(0, Number(input.reorderQty) || 0),
    costingMethod: input.costingMethod === 'fifo' ? 'fifo' : 'wac',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Base-units-per-1 of the given unit. Undefined/base unit → 1; unknown units are rejected. */
export function uomFactor(item: Pick<StockItem, 'unit' | 'altUnits'>, unit?: string): number {
  const u = unit?.trim();
  if (!u || u.toLowerCase() === item.unit.toLowerCase()) return 1;
  const alt = item.altUnits.find((a) => a.unit.toLowerCase() === u.toLowerCase());
  if (!alt) throw new Error(`unknown unit "${u}" (base ${item.unit}${item.altUnits.length ? `, alt ${item.altUnits.map((a) => a.unit).join('/')}` : ''})`);
  return alt.factor;
}

/** Convert a quantity entered in any of the item's units to the base unit. */
export function toBaseQty(item: Pick<StockItem, 'unit' | 'altUnits'>, quantity: number, unit?: string): number {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) throw new Error('quantity must be positive');
  return Math.round(q * uomFactor(item, unit) * 10000) / 10000;
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
  /** Cost per unit of this movement: receipt price for `in`; the WAC at issue (COGS rate) for `out`. */
  unitCost: number;
  /** Inventory value (balanceAfter × avgCost) after this movement. */
  valueAfter: number;
  createdAt: string;
}

export interface NewStockMovement {
  stockItemId: Id;
  tenantId: Id;
  direction: StockDirection;
  quantity: number;
  reason?: string;
  unitCost?: number;
}

/** Compute the new on-hand after applying a movement; throws if an issue would go negative. */
export function applyMovement(onHand: number, direction: StockDirection, quantity: number): number {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) throw new Error('movement quantity must be positive');
  const next = direction === 'in' ? onHand + q : onHand - q;
  if (next < 0) throw new Error(`insufficient stock: on-hand ${onHand}, issue ${q}`);
  return next;
}

/**
 * Moving weighted-average cost. A receipt re-averages: new avg = (prevQty·prevAvg + inQty·inCost)/(prevQty+inQty).
 * An issue leaves the average unchanged (it draws down at the running WAC). Returns the new avgCost.
 */
export function computeWac(prevQty: number, prevAvg: number, direction: StockDirection, qty: number, unitCost: number): number {
  if (direction === 'out') return prevAvg;
  const c = Math.max(0, Number(unitCost) || 0);
  const totalQty = prevQty + qty;
  if (totalQty <= 0) return c;
  return (prevQty * prevAvg + qty * c) / totalQty;
}

export function makeStockMovement(input: NewStockMovement, balanceAfter: number, newAvgCost = 0): StockMovement {
  const unitCost = input.direction === 'in' ? Math.max(0, Number(input.unitCost) || 0) : newAvgCost;
  return {
    id: newId(),
    tenantId: input.tenantId,
    stockItemId: input.stockItemId,
    direction: input.direction,
    quantity: Number(input.quantity),
    reason: input.reason?.trim() || (input.direction === 'in' ? 'receipt' : 'issue'),
    balanceAfter,
    unitCost,
    valueAfter: Math.round(balanceAfter * newAvgCost * 100) / 100,
    createdAt: new Date().toISOString(),
  };
}

export interface ValuationLine {
  itemId: Id;
  code: string;
  name: string;
  warehouse: string;
  unit: string;
  quantityOnHand: number;
  avgCost: number;
  totalValue: number;
}

export interface ValuationSummary {
  lines: ValuationLine[];
  grandTotal: number;
}

/** Roll item on-hand × WAC into a per-item + grand-total inventory valuation. */
export function summariseValuation(items: StockItem[]): ValuationSummary {
  const lines = items.map((i) => ({
    itemId: i.id,
    code: i.code,
    name: i.name,
    warehouse: i.warehouse,
    unit: i.unit,
    quantityOnHand: i.quantityOnHand,
    avgCost: i.avgCost,
    totalValue: Math.round(i.quantityOnHand * i.avgCost * 100) / 100,
  }));
  const grandTotal = Math.round(lines.reduce((s, l) => s + l.totalValue, 0) * 100) / 100;
  return { lines, grandTotal };
}

/** True when a reorder policy is set (reorderLevel > 0) and on-hand has fallen to/below it. */
export function isBelowReorder(item: StockItem): boolean {
  return item.reorderLevel > 0 && item.quantityOnHand <= item.reorderLevel;
}

/** Suggested replenishment qty: the configured reorderQty, else enough to top back up to reorderLevel. */
export function suggestedReorderQty(item: StockItem): number {
  if (item.reorderQty > 0) return item.reorderQty;
  return Math.max(0, item.reorderLevel - item.quantityOnHand);
}

export interface ReorderLine {
  itemId: Id;
  code: string;
  name: string;
  warehouse: string;
  unit: string;
  quantityOnHand: number;
  reorderLevel: number;
  suggestedQty: number;
}

export interface ReorderReport {
  lines: ReorderLine[];
  count: number;
}

/** Items at/below their reorder level, with a suggested order quantity, soonest-shortest first. */
export function summariseReorder(items: StockItem[]): ReorderReport {
  const lines = items
    .filter(isBelowReorder)
    .map((i) => ({
      itemId: i.id,
      code: i.code,
      name: i.name,
      warehouse: i.warehouse,
      unit: i.unit,
      quantityOnHand: i.quantityOnHand,
      reorderLevel: i.reorderLevel,
      suggestedQty: suggestedReorderQty(i),
    }))
    .sort((a, b) => a.quantityOnHand - a.reorderLevel - (b.quantityOnHand - b.reorderLevel));
  return { lines, count: lines.length };
}

export const STOCK_EVENT = {
  itemCreated: 'inventory.stock.item_created',
  movementRecorded: 'inventory.stock.movement_recorded',
  reorderPolicySet: 'inventory.stock.reorder_policy_set',
} as const;
