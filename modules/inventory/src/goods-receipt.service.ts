import { Inject, Injectable, Logger, type OnModuleInit, Optional } from '@nestjs/common';
import { type Id, makeEvent, newId, sameTenantOrNull } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { INVENTORY_EVENT, type GoodsReceipt, type NewGoodsReceipt, makeGoodsReceipt } from './domain/goods-receipt';
import { GRN_LINE_STORE, type GoodsReceiptLineStore } from './goods-receipt-line-store';
import { acceptedByPoLine, type GoodsReceiptLine, makeGoodsReceiptLine, nextReceiptLineNo, rejectedByPoLine } from './domain/goods-receipt-line';
import { GOODS_RECEIPT_STORE, type GoodsReceiptFilter, type GoodsReceiptStore } from './goods-receipt-store';

const CREATE_GRN = 'inventory.grn.create';

/**
 * Inventory service — receives goods against a PO. Owns `aura_inventory_grns`, emits
 * `inventory.grn.*` on the spine. References the PO + carries supplier/project down by
 * snapshot — no DB join.
 *
 * Create dispatches through the kernel `CommandBus` (validate → authz → idempotency →
 * one transaction → atomic row + outbox event), mirroring the CRM reference integration.
 */
@Injectable()
export class GoodsReceiptService implements OnModuleInit {
  private readonly logger = new Logger('Inventory');

  constructor(
    @Inject(GOODS_RECEIPT_STORE) private readonly store: GoodsReceiptStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly commands: CommandBus,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    /** The note's LINES — which ordered material arrived, and how much of it was kept. */
    @Optional() @Inject(GRN_LINE_STORE) private readonly lines: GoodsReceiptLineStore | null = null,
  ) {}

  onModuleInit(): void {
    this.commands.register<NewGoodsReceipt, GoodsReceipt>({
      name: CREATE_GRN,
      permission: 'inventory.grn.create',
      validate: (input) => {
        if (!input.title || !input.title.trim()) throw new Error('goods receipt title is required');
      },
      handler: async (command, tx) => {
        const grn = makeGoodsReceipt(command.payload);
        const event = makeEvent({
          type: INVENTORY_EVENT.grnCreated,
          tenantId: grn.tenantId,
          companyId: grn.companyId,
          actorId: grn.createdBy,
          aggregateType: 'inventory.grn',
          aggregateId: grn.id,
          payload: {
            title: grn.title,
            status: grn.status,
            value: grn.value,
            supplier: grn.supplierName,
            po: grn.poId ? { id: grn.poId, title: grn.poTitle } : null,
            project: grn.projectId ? { id: grn.projectId, name: grn.projectName } : null,
            // BOQ coding → the Quantity Ledger accrues RECEIVED quantity on this measured line.
            boqItemId: grn.boqItemId,
            receivedQuantity: grn.receivedQuantity,
            unit: grn.unit,
          },
        });
        await this.store.createWithClient(tx, grn);
        await this.events.appendWithClient(tx, [event]);
        this.logger.log(`GRN created: ${grn.title} (${grn.id}) value=${grn.value}`);
        return grn;
      },
    });
  }

  create(input: NewGoodsReceipt, idempotencyKey?: string | null): Promise<GoodsReceipt> {
    return this.commands.execute<GoodsReceipt>({
      id: newId(),
      name: CREATE_GRN,
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorId: input.createdBy ?? null,
      payload: input,
      idempotencyKey: idempotencyKey ?? null,
    });
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<GoodsReceipt | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: GoodsReceiptFilter): Promise<GoodsReceipt[]> {
    return this.store.list(filter);
  }

  listPaged(filter: GoodsReceiptFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }

  receivedQuantityForPo(tenantId: Id, poId: Id): Promise<number | null> {
    return this.store.receivedQuantityForPo(tenantId, poId);
  }

  /**
   * Record what arrived against ONE ORDER LINE.
   *
   * A receipt line must name the order line it answers, and must say something arrived — an
   * acceptance, a rejection, or both. A rejection costs a reason, because a rejection nobody
   * explained cannot be acted on by the supplier or by anybody chasing the balance.
   */
  async addLine(input: {
    grnId: Id; poLineId: Id; quantityAccepted?: number; quantityRejected?: number;
    rejectionReason?: string | null; notes?: string | null;
  }): Promise<GoodsReceiptLine> {
    if (!this.lines) throw new Error('receipt lines are unavailable in this composition');
    const ctx = this.tenant?.get();
    const tenantId = this.tenant?.boundTenantId() ?? ctx?.tenantId ?? '';
    const grn = await this.store.get(input.grnId);
    if (!grn || grn.tenantId !== tenantId) throw new Error(`not found: goods receipt ${input.grnId}`);

    const existing = await this.lines.listForReceipt(grn.id, grn.tenantId);
    const line = makeGoodsReceiptLine({
      tenantId: grn.tenantId,
      companyId: grn.companyId,
      grnId: grn.id,
      lineNo: nextReceiptLineNo(existing),
      poLineId: input.poLineId,
      quantityAccepted: input.quantityAccepted,
      quantityRejected: input.quantityRejected,
      rejectionReason: input.rejectionReason,
      notes: input.notes,
      createdBy: ctx?.actorId ?? null,
    });
    await this.lines.save(line);
    /**
     * The order reconciles on THIS, not on the note's creation.
     *
     * A goods receipt note is created before anybody has written what is on it, so nothing about
     * the order's delivery position can be concluded at that moment. It can be concluded from a
     * line — which is exactly what this event carries.
     */
    await this.events.append([
      makeEvent({
        type: INVENTORY_EVENT.grnLineRecorded,
        tenantId: grn.tenantId,
        companyId: grn.companyId,
        actorId: ctx?.actorId ?? null,
        aggregateType: 'inventory.grn',
        aggregateId: grn.id,
        payload: {
          grnId: grn.id,
          poId: grn.poId,
          poLineId: line.poLineId,
          quantityAccepted: line.quantityAccepted,
          quantityRejected: line.quantityRejected,
        },
      }),
    ]);
    this.logger.log(
      `GRN ${grn.id} line ${line.lineNo}: accepted ${line.quantityAccepted}, rejected ${line.quantityRejected} ` +
      `against order line ${line.poLineId}`,
    );
    return line;
  }

  listLines(grnId: Id, tenantId?: Id): Promise<GoodsReceiptLine[]> {
    if (!this.lines) return Promise.resolve([]);
    return this.lines.listForReceipt(grnId, this.tenant?.boundTenantId() ?? tenantId ?? '');
  }

  /**
   * How much of each order line has been ACCEPTED, and how much REJECTED — reported apart.
   *
   * Procurement decides what these mean for the order; Inventory only says what arrived. Keeping
   * them separate here is what stops a rejected delivery being read as progress upstream.
   */
  async receiptPositions(tenantId: Id, poLineIds: Id[]): Promise<{
    accepted: Record<string, number>; rejected: Record<string, number>;
  }> {
    if (!this.lines) return { accepted: {}, rejected: {} };
    const lines = await this.lines.listForOrderLines(poLineIds, tenantId);
    return { accepted: acceptedByPoLine(lines), rejected: rejectedByPoLine(lines) };
  }
}
