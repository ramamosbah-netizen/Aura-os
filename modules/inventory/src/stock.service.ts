import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import {
  STOCK_EVENT,
  type StockItem,
  type StockMovement,
  type StockDirection,
  type NewStockItem,
  type ValuationSummary,
  type ReorderReport,
  type UomConversion,
  makeStockItem,
  makeStockMovement,
  applyMovement,
  computeWac,
  normaliseAltUnits,
  summariseValuation,
  summariseReorder,
  toBaseQty,
  uomFactor,
} from './domain/stock';
import { computeFifo, fifoIssueCost, fifoReceiptState, type FifoMove } from './domain/fifo';
import { STOCK_STORE, type StockFilter, type StockStore } from './stock-store';

/**
 * Stock service — the on-hand side of Inventory. Owns `aura_inventory_stock_items` and its
 * movements, goes through the access seam, and emits `inventory.stock.*` on the spine.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger('Stock');

  constructor(
    @Inject(STOCK_STORE) private readonly store: StockStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
  ) {}

  async createItem(input: NewStockItem): Promise<StockItem> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'inventory.stock.create', orgPath };
      this.access.assert(input.createdBy, target);
    }
    const existing = await this.store.getItemByCode(input.tenantId, input.code.trim());
    if (existing) throw new Error(`stock item code ${input.code} already exists`);
    if (input.barcode?.trim()) {
      const dup = await this.store.getItemByBarcode(input.tenantId, input.barcode.trim());
      if (dup) throw new Error(`barcode ${input.barcode} is already assigned to ${dup.code}`);
    }

    const item = makeStockItem(input);
    await this.store.createItem(item);
    await this.events.append([
      makeEvent({
        type: STOCK_EVENT.itemCreated,
        tenantId: item.tenantId,
        companyId: item.companyId,
        actorId: item.createdBy,
        aggregateType: 'inventory.stock',
        aggregateId: item.id,
        payload: { code: item.code, name: item.name, onHand: item.quantityOnHand, warehouse: item.warehouse },
      }),
    ]);
    this.logger.log(`Stock item created: ${item.code} ${item.name} (on-hand ${item.quantityOnHand})`);
    return item;
  }

  /**
   * Record a stock movement (in/out), updating the item's on-hand. Issues can't go negative.
   * `unit` may be any of the item's UOMs — quantity converts to base, and a receipt's
   * unitCost (priced per entered unit) converts to a per-base-unit rate.
   */
  async recordMovement(stockItemId: Id, direction: StockDirection, quantity: number, reason?: string, unitCost?: number, unit?: string): Promise<{ item: StockItem; movement: StockMovement }> {
    const item = await this.store.getItem(stockItemId);
    if (!item) throw new Error(`stock item ${stockItemId} not found`);

    const factor = uomFactor(item, unit);
    const baseQty = toBaseQty(item, quantity, unit);
    const baseUnitCost = unitCost !== undefined ? Number(unitCost) / factor : undefined;
    quantity = baseQty;
    unitCost = baseUnitCost;

    const balanceAfter = applyMovement(item.quantityOnHand, direction, quantity);
    let newAvgCost = computeWac(item.quantityOnHand, item.avgCost, direction, Number(quantity), Number(unitCost));
    const movement = makeStockMovement({ stockItemId, tenantId: item.tenantId, direction, quantity, reason, unitCost }, balanceAfter, newAvgCost);

    // FIFO costing: value the issue (COGS) and remaining inventory from the item's cost layers,
    // replayed from its movement history. The movement's unitCost then carries the FIFO issue rate
    // so the perpetual-inventory GL reactor posts Dr COGS / Cr Inventory at FIFO (not WAC).
    if (item.costingMethod === 'fifo') {
      const prior: FifoMove[] = (await this.store.listMovements(stockItemId))
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map((m) => ({ direction: m.direction, quantity: m.quantity, unitCost: m.unitCost }));
      if (direction === 'out') {
        const f = fifoIssueCost(prior, Number(quantity));
        movement.unitCost = f.unitCost;      // FIFO COGS rate for this issue
        movement.valueAfter = f.remainingValue;
        newAvgCost = f.avgCost;
      } else {
        const f = fifoReceiptState(prior, Number(quantity), Math.max(0, Number(unitCost) || 0));
        movement.unitCost = Math.max(0, Number(unitCost) || 0); // receipt price
        movement.valueAfter = f.remainingValue;
        newAvgCost = f.avgCost;
      }
    }

    const updated: StockItem = { ...item, quantityOnHand: balanceAfter, avgCost: newAvgCost };

    await this.store.updateItem(updated);
    await this.store.addMovement(movement);
    await this.events.append([
      makeEvent({
        type: STOCK_EVENT.movementRecorded,
        tenantId: item.tenantId,
        companyId: item.companyId,
        actorId: null,
        aggregateType: 'inventory.stock',
        aggregateId: item.id,
        payload: {
          code: item.code,
          name: item.name,
          unit: item.unit,
          direction,
          quantity: movement.quantity,
          balanceAfter,
          unitCost: movement.unitCost,
          avgCost: newAvgCost,
          valueAfter: movement.valueAfter,
          reorderLevel: item.reorderLevel,
          reorderQty: item.reorderQty,
        },
      }),
    ]);
    this.logger.log(`Stock ${direction} ${movement.quantity} ${item.unit} of ${item.code} → on-hand ${balanceAfter}`);
    return { item: updated, movement };
  }

  getItem(id: Id): Promise<StockItem | null> {
    return this.store.getItem(id);
  }

  /** Scanner flow: resolve an item from its barcode. */
  getItemByBarcode(tenantId: Id, barcode: string): Promise<StockItem | null> {
    return this.store.getItemByBarcode(tenantId, barcode.trim());
  }

  /** Assign/replace an item's barcode and alternative UOMs. */
  async setItemUom(stockItemId: Id, input: { barcode?: string | null; altUnits?: UomConversion[] }): Promise<StockItem> {
    const item = await this.store.getItem(stockItemId);
    if (!item) throw new Error(`stock item ${stockItemId} not found`);

    let barcode = item.barcode;
    if (input.barcode !== undefined) {
      barcode = input.barcode?.trim() || null;
      if (barcode) {
        const dup = await this.store.getItemByBarcode(item.tenantId, barcode);
        if (dup && dup.id !== item.id) throw new Error(`barcode ${barcode} is already assigned to ${dup.code}`);
      }
    }
    const altUnits = input.altUnits !== undefined ? normaliseAltUnits(item.unit, input.altUnits) : item.altUnits;

    const updated: StockItem = { ...item, barcode, altUnits };
    await this.store.updateItem(updated);
    this.logger.log(`UOM/barcode set for ${item.code}: barcode=${barcode ?? '—'}, altUnits=${altUnits.map((u) => `${u.unit}×${u.factor}`).join(',') || '—'}`);
    return updated;
  }

  async getItemWithMovements(id: Id): Promise<{ item: StockItem; movements: StockMovement[] } | null> {
    const item = await this.store.getItem(id);
    if (!item) return null;
    return { item, movements: await this.store.listMovements(id) };
  }

  listItems(filter?: StockFilter): Promise<StockItem[]> {
    return this.store.listItems(filter);
  }

  listItemsPaged(filter: StockFilter, page: import('@aura/shared').PageParams) {
    return this.store.listItemsPaged(filter, page);
  }

  /** FIFO valuation for one item, replayed from its movement history (WAC stays the GL method). */
  async fifoValuation(id: Id): Promise<{ code: string; onHand: number; fifoValue: number; wacValue: number; cogsTotal: number; layers: Array<{ quantity: number; unitCost: number }> } | null> {
    const item = await this.store.getItem(id);
    if (!item) return null;
    const moves = (await this.store.listMovements(id))
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((m) => ({ direction: m.direction, quantity: m.quantity, unitCost: m.unitCost }));
    const f = computeFifo(moves);
    return { code: item.code, ...f, wacValue: Math.round(item.quantityOnHand * item.avgCost * 100) / 100 };
  }

  /** Inventory valuation report: each item's on-hand × WAC, plus the grand total. */
  async valuation(filter?: StockFilter): Promise<ValuationSummary> {
    return summariseValuation(await this.store.listItems(filter));
  }

  /** Set/clear an item's replenishment policy (reorder level + suggested order qty). */
  async setReorderPolicy(stockItemId: Id, reorderLevel: number, reorderQty: number): Promise<StockItem> {
    const item = await this.store.getItem(stockItemId);
    if (!item) throw new Error(`stock item ${stockItemId} not found`);
    const level = Math.max(0, Number(reorderLevel) || 0);
    const qty = Math.max(0, Number(reorderQty) || 0);
    const updated: StockItem = { ...item, reorderLevel: level, reorderQty: qty };
    await this.store.updateItem(updated);
    await this.events.append([
      makeEvent({
        type: STOCK_EVENT.reorderPolicySet,
        tenantId: item.tenantId,
        companyId: item.companyId,
        actorId: null,
        aggregateType: 'inventory.stock',
        aggregateId: item.id,
        payload: { code: item.code, reorderLevel: level, reorderQty: qty },
      }),
    ]);
    this.logger.log(`Reorder policy set for ${item.code}: level ${level}, qty ${qty}`);
    return updated;
  }

  /** Replenishment watch-list: items at/below their reorder level with a suggested order qty. */
  async reorderReport(filter?: StockFilter): Promise<ReorderReport> {
    return summariseReorder(await this.store.listItems(filter));
  }
}
