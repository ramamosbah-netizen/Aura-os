import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent, mulMoney, newId } from '@aura/shared';
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
import { ISSUED_POSITION, type IssuedPosition } from './issued-position.port';
import { WORK_PACKAGE, type WorkPackage } from './work-package.port';
import { DELIVERY_ACK_STORE, type DeliveryAcknowledgement, type DeliveryAcknowledgementStore } from './delivery-acknowledgement.store';
import { mayAcknowledgeDelivery, acknowledgementCoverage } from './domain/delivery-acknowledgement';
import { mayReturnFromProject } from './domain/material-return';
import {
  deliveredToWorkPackage, issuedWithoutWorkPackage, type MovementFacts,
} from './domain/work-package-delivery';

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
    /**
     * How much of a material is currently issued to a project's BOQ item.
     *
     * OPTIONAL and LAST — this service is built positionally elsewhere. Explicit @Inject because a
     * union-typed parameter emits `Object` in design:paramtypes and Nest would silently bind
     * nothing, which is the defect PLN-04 paid for and BUY-05 repeated. Unbound, a project-coded
     * RETURN is refused rather than waved through: optional dependency, never optional evidence.
     */
    @Optional() @Inject(ISSUED_POSITION) private readonly issuedPosition: IssuedPosition | null = null,
    @Optional() @Inject(WORK_PACKAGE) private readonly workPackage: WorkPackage | null = null,
    @Optional() @Inject(DELIVERY_ACK_STORE) private readonly acks: DeliveryAcknowledgementStore | null = null,
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
  async recordMovement(
    stockItemId: Id,
    direction: StockDirection,
    quantity: number,
    reason?: string,
    unitCost?: number,
    unit?: string,
    // Project coding: when an issue/return is coded to a CBS cost line, the Transaction Engine
    // reacts to the emitted event and posts the material cost + quantity to that line.
    coding?: { projectId?: Id | null; cbsNodeId?: Id | null; boqItemId?: Id | null; wbsNodeId?: Id | null },
    /**
     * WHO is recording this movement. Appended LAST because this service is built positionally.
     *
     * Stock movements never recorded an actor. That is an audit gap on its own, and it is also what
     * makes `BUY-07`'s receipt meaningful: a delivery the issuer signs for proves nothing, and the
     * rule cannot be evaluated against a movement whose issuer is unknown.
     */
    actorId?: Id | null,
  ): Promise<{ item: StockItem; movement: StockMovement }> {
    const item = await this.store.getItem(stockItemId);
    if (!item) throw new Error(`stock item ${stockItemId} not found`);

    /**
     * YOU CANNOT RETURN MORE THAN YOU TOOK (`BUY-06`).
     *
     * Only for a return CODED TO A PROJECT's BOQ item — an uncoded receipt is a warehouse movement
     * with no issued balance to be measured against. Checked before anything is written, because a
     * movement that should not exist must not exist even briefly.
     */
    /**
     * A DECLARED WORK-PACKAGE DESTINATION IS VALIDATED BEFORE ANYTHING IS WRITTEN (`BUY-07`).
     *
     * The rule is narrow on purpose. A project issue does not have to name a work package —
     * `BUY-06` established that authority and it is extended here, not redefined — but an issue that
     * DOES name one is claiming a destination, and a claim nobody checked is worse than no claim at
     * all. So the declaration is refused unless the node exists, is a work package, and belongs to
     * this movement's own project.
     *
     * An UNBOUND port refuses it too. The dependency is optional by construction (Inventory does not
     * import Projects); the evidence never is. Silently accepting an unverifiable destination would
     * write provenance nobody checked into the column the whole capability reads from.
     *
     * A destination without a project is refused outright: a work package belongs to a project, so
     * naming one on an uncoded warehouse movement is not a delivery, it is a mistake.
     */
    if (coding?.wbsNodeId) {
      if (!coding.projectId) {
        throw new Error('a work package cannot be named on a movement that is not coded to a project');
      }
      if (!this.workPackage) {
        throw new Error(
          'cannot verify the work package this material is being delivered to — the project ' +
          'structure is unavailable, and a destination cannot be recorded against a work package ' +
          'nobody could check',
        );
      }
      const ok = await this.workPackage.belongsToProject(item.tenantId, coding.projectId, coding.wbsNodeId);
      if (!ok) {
        throw new Error(
          `work package ${coding.wbsNodeId} does not belong to this movement’s project, so it ` +
          'cannot be the destination of this material',
        );
      }
    }

    const isProjectReturn = direction === 'in' && Boolean(coding?.projectId && coding?.boqItemId);
    if (isProjectReturn) {
      const netIssued = this.issuedPosition
        ? await this.issuedPosition.netIssued(item.tenantId, coding!.projectId!, coding!.boqItemId!)
        : null;
      const verdict = mayReturnFromProject(netIssued, Number(toBaseQty(item, quantity, unit)));
      if (!verdict.allowed) throw new Error(verdict.reason);
    }

    const factor = uomFactor(item, unit);
    const baseQty = toBaseQty(item, quantity, unit);
    const baseUnitCost = unitCost !== undefined ? Number(unitCost) / factor : undefined;
    quantity = baseQty;
    unitCost = baseUnitCost;

    /**
     * A RETURN IS VALUED FROM THE ITEM'S PERSISTED CURRENT VALUATION STATE.
     *
     * A return carries no price, and `computeWac` reads a missing cost as 0, so a return re-entered
     * stock valued at NOTHING: 100 m received at 6.00, 40 issued, 15 returned left the item at 4.80
     * and 360 in value instead of 450. AED 90 destroyed, the running cost dragged down for
     * everything still on hand, and ON-HAND CORRECT THROUGHOUT — which is why it was silent.
     *
     * THIS IS NOT A NEW COSTING POLICY, and the three levels must not be conflated:
     *
     *   `costingMethod`   chooses the ENGINE for this item — `'wac'` or `'fifo'`.
     *   `avgCost`         is the PERSISTED CURRENT VALUATION STATE that engine produced.
     *   return valuation  CONSUMES that current state. It does not reinvent costing policy, and it
     *                     does not reconstruct how the state was arrived at.
     *
     * So the line below reads state, not method. It is correct under both engines for that reason
     * alone, and the distinction is measurable rather than asserted: on a FIFO item that received
     * 100 @ 6.00 then 100 @ 12.00 and issued 50, the answers a cheap implementation might reach are
     * all different —
     *
     *     persisted current valuation state   10.00   <- what this uses
     *     last purchase price                 12.00
     *     historical issue COGS rate           6.00
     *
     * Resolved HERE, from the persisted item, rather than sent by the screen: a price supplied by a
     * browser is not authoritative about what a company's stock is worth. An item whose state is
     * genuinely 0 returns at 0 — there is no value to restore.
     *
     * LIMIT, stated rather than implied: a return CREATES/RESTORES inventory using the current
     * persisted valuation state. Original FIFO layer provenance and reversal are NOT modelled and
     * NOT proven — this is not strict original-layer reversal, and nothing here should be read as
     * the FIFO engine rebuilding the layer the material was issued from. Carried forward; no
     * remediation is opened unless a later acceptance proof requires strict layer reversal.
     */
    if (isProjectReturn && unitCost === undefined) unitCost = item.avgCost;

    const balanceAfter = applyMovement(item.quantityOnHand, direction, quantity);
    let newAvgCost = computeWac(item.quantityOnHand, item.avgCost, direction, Number(quantity), Number(unitCost));
    const movement = makeStockMovement(
      { stockItemId, tenantId: item.tenantId, direction, quantity, reason, unitCost, projectId: coding?.projectId ?? null, cbsNodeId: coding?.cbsNodeId ?? null, boqItemId: coding?.boqItemId ?? null, wbsNodeId: coding?.wbsNodeId ?? null, issuedBy: actorId ?? null },
      balanceAfter,
      newAvgCost,
    );

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
          movementId: movement.id,
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
          // Project coding (null for plain warehouse receipts) — drives the Material cost strand.
          projectId: movement.projectId,
          cbsNodeId: movement.cbsNodeId,
          boqItemId: movement.boqItemId,
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

  async getItemWithMovements(id: Id): Promise<{
    item: StockItem; movements: StockMovement[]; acknowledgedMovementIds: Id[];
  } | null> {
    const item = await this.store.getItem(id);
    if (!item) return null;
    const movements = await this.store.listMovements(id);
    /**
     * WHICH DELIVERIES HAVE BEEN RECEIPTED (`BUY-07`), read from the server.
     *
     * The screen must not hold this in component state: the row re-renders after every movement,
     * and a receipt remembered only in the browser disappears with it — the next role acknowledges
     * and the screen forgets, which is indistinguishable from never having acknowledged. Found by
     * the browser proof.
     *
     * Still no quantity: this says WHICH movements were accepted, never how much.
     */
    const packages = [...new Set(movements.map((m) => m.wbsNodeId).filter((w): w is Id => Boolean(w)))];
    const acknowledgedMovementIds: Id[] = [];
    if (this.acks) {
      for (const wbsNodeId of packages) {
        for (const ack of await this.acks.listByWorkPackage(item.tenantId, wbsNodeId)) {
          acknowledgedMovementIds.push(ack.movementId);
        }
      }
    }
    return { item, movements, acknowledgedMovementIds };
  }

  /**
   * The parts behind specific references, for a domain that points at one without owning it
   * (TC-GATE-17, corrected in TC-GATE-18).
   *
   * Implements `InventoryPort` for Handover, whose spares record names a part so a client can be
   * told which one they were handed. A projection of code, name and unit: everything that makes this
   * Inventory's — quantities, warehouse, average cost, costing method, reorder policy — stays here.
   * A consumer that cannot see valuation cannot come to depend on it, and a spares list handed to a
   * client has no business carrying what the contractor paid.
   *
   * TARGETED, AND THAT IS THE CORRECTION. The first version listed the tenant's stock and let the
   * caller search it — and `listItems` applies a default `LIMIT 200`. Past two hundred parts, a
   * valid reference resolved as "not in inventory" and the write that checks it refused a real part.
   * A resolver must not be built on a read that silently truncates.
   *
   * BY CODE FIRST, because a person types the code on the shelf label. The id path re-checks the
   * tenant in application code rather than relying only on row-level security: `getItem` carries no
   * tenant in its SQL, and a resolver is the wrong place to depend on a single layer.
   */
  async readStockItems(
    tenantId: Id,
    references: string[],
  ): Promise<Array<{ id: string; code: string; name: string; unit: string }>> {
    const wanted = [...new Set((references ?? []).map((r) => r?.trim()).filter((r): r is string => Boolean(r)))];
    if (wanted.length === 0) return [];

    const found = await Promise.all(
      wanted.map(async (ref) => {
        const byCode = await this.store.getItemByCode(tenantId, ref);
        if (byCode) return byCode;
        const byId = await this.store.getItem(ref).catch(() => null);
        return byId && byId.tenantId === tenantId ? byId : null;
      }),
    );

    const seen = new Set<string>();
    return found
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit }));
  }

  listItems(filter?: StockFilter): Promise<StockItem[]> {
    return this.store.listItems(filter);
  }

  listItemsPaged(filter: StockFilter, page: import('@aura/shared').PageParams) {
    return this.store.listItemsPaged(filter, page);
  }

  /**
   * THE NEXT-ROLE RECEIPT (`BUY-07`): Site accepts material delivered to a work package.
   *
   * Records ONE fact — a named person accepted receipt of an already-persisted movement — and writes
   * NO quantity. What was delivered is derived from the movements and keeps a single authority; a
   * receipt carrying its own figure would be a second writer of that number.
   */
  async acknowledgeDelivery(
    tenantId: Id, stockItemId: Id, movementId: Id, actorId: Id, note?: string | null,
  ): Promise<DeliveryAcknowledgement> {
    // Worded so the HTTP taxonomy classifies it rather than letting it escape as a 500 — the same
    // shape as the other unbound-port refusals in this service.
    if (!this.acks) {
      throw new Error('cannot record a delivery receipt — acknowledgements are unavailable in this deployment');
    }
    const movement = (await this.store.listMovements(stockItemId)).find((m) => m.id === movementId);
    if (!movement || movement.tenantId !== tenantId) throw new Error(`movement ${movementId} not found`);

    // Who is accountable for the package the MOVEMENT named. Unbound, nobody can be verified as the
    // recipient, so the receipt is refused rather than recorded against an unchecked authority.
    const recipientId = movement.wbsNodeId && movement.projectId && this.workPackage
      ? await this.workPackage.siteRecipientFor(tenantId, movement.projectId, movement.wbsNodeId)
      : null;

    const existing = await this.acks.getByMovement(tenantId, movementId);
    const verdict = mayAcknowledgeDelivery({
      wbsNodeId: movement.wbsNodeId,
      direction: movement.direction === 'in' ? 'in' : 'out',
      issuedBy: movement.issuedBy,
      actorId,
      recipientId,
      alreadyAcknowledged: Boolean(existing),
    });
    if (!verdict.allowed) throw new Error(verdict.message);

    const now = new Date().toISOString();
    const value: DeliveryAcknowledgement = {
      id: newId(), tenantId, companyId: null, movementId,
      wbsNodeId: movement.wbsNodeId as Id, projectId: movement.projectId as Id,
      acknowledgedBy: actorId, acknowledgedAt: now, note: note?.trim() || null, createdAt: now,
    };
    await this.acks.create(value);
    this.logger.log(`Delivery ${movementId} acknowledged at work package ${value.wbsNodeId}`);
    return value;
  }

  /**
   * How much of what reached a work package has been RECEIPTED — counted in MOVEMENTS.
   *
   * Deliberately not a quantity: "2 of 3 deliveries acknowledged" is a statement about receipts,
   * while "18 m of 20 m acknowledged" would be a second quantity beside the one the movements
   * already establish, free to drift away from it.
   */
  async acknowledgementCoverageFor(tenantId: Id, projectId: Id, wbsNodeId: Id): Promise<{
    deliveries: number; acknowledged: number; outstanding: number;
  }> {
    if (!this.acks) return { deliveries: 0, acknowledged: 0, outstanding: 0 };
    const moves = await this.store.listMovementsByProject(tenantId, projectId);
    const deliveryIds = moves.filter((m) => m.wbsNodeId === wbsNodeId && m.direction === 'out').map((m) => m.id);
    const acked = new Set((await this.acks.listByWorkPackage(tenantId, wbsNodeId)).map((a) => a.movementId));
    return acknowledgementCoverage(deliveryIds, acked);
  }

  /**
   * WHAT MATERIAL REACHED A PROJECT'S WORK PACKAGES (`BUY-07`).
   *
   * The read the next role consumes, and it is built to keep one promise: a work package is credited
   * with material ONLY where a movement named it. Nothing is resolved from `boqItemId`, so a package
   * that shares a measured item with another is never handed the other's material.
   *
   * `unspecified` is the counterpart, and it is reported ONCE for the project rather than against
   * every package. Material left the store for this project and nobody recorded where it went — a
   * real gap, and one that would be hidden by reading it as zero or spread falsely by attaching it
   * to each package as UNKNOWN.
   */
  async workPackageDeliveries(tenantId: Id, projectId: Id, wbsNodeIds: Id[]): Promise<{
    deliveries: Array<{ wbsNodeId: string; quantity: number; value: number; movements: number }>;
    unspecified: { quantity: number; value: number; movements: number };
  }> {
    const moves = await this.store.listMovementsByProject(tenantId, projectId);
    const facts: MovementFacts[] = moves.map((m) => ({
      direction: m.direction === 'in' ? 'in' : 'out',
      quantity: Number(m.quantity),
      unitCost: Number(m.unitCost),
      projectId: m.projectId,
      boqItemId: m.boqItemId,
      wbsNodeId: m.wbsNodeId,
    }));
    return {
      deliveries: wbsNodeIds.map((id) => deliveredToWorkPackage(id, facts)),
      unspecified: issuedWithoutWorkPackage(projectId, facts),
    };
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
    return { code: item.code, ...f, wacValue: Number(mulMoney(item.quantityOnHand, item.avgCost)) };
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
