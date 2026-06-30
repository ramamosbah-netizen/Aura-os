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
  makeStockItem,
  makeStockMovement,
  applyMovement,
  computeWac,
  summariseValuation,
  summariseReorder,
} from './domain/stock';
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

  /** Record a stock movement (in/out), updating the item's on-hand. Issues can't go negative. */
  async recordMovement(stockItemId: Id, direction: StockDirection, quantity: number, reason?: string, unitCost?: number): Promise<{ item: StockItem; movement: StockMovement }> {
    const item = await this.store.getItem(stockItemId);
    if (!item) throw new Error(`stock item ${stockItemId} not found`);

    const balanceAfter = applyMovement(item.quantityOnHand, direction, quantity);
    const newAvgCost = computeWac(item.quantityOnHand, item.avgCost, direction, Number(quantity), Number(unitCost));
    const movement = makeStockMovement({ stockItemId, tenantId: item.tenantId, direction, quantity, reason, unitCost }, balanceAfter, newAvgCost);
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

  async getItemWithMovements(id: Id): Promise<{ item: StockItem; movements: StockMovement[] } | null> {
    const item = await this.store.getItem(id);
    if (!item) return null;
    return { item, movements: await this.store.listMovements(id) };
  }

  listItems(filter?: StockFilter): Promise<StockItem[]> {
    return this.store.listItems(filter);
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
