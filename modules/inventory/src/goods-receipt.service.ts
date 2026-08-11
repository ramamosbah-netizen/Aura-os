import { Inject, Injectable, Logger, type OnModuleInit, Optional } from '@nestjs/common';
import { type Id, makeEvent, newId, sameTenantOrNull } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { INVENTORY_EVENT, type GoodsReceipt, type NewGoodsReceipt, makeGoodsReceipt } from './domain/goods-receipt';
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
}
