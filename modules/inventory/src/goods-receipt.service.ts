import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import { INVENTORY_EVENT, type GoodsReceipt, type NewGoodsReceipt, makeGoodsReceipt } from './domain/goods-receipt';
import { GOODS_RECEIPT_STORE, type GoodsReceiptFilter, type GoodsReceiptStore } from './goods-receipt-store';

/**
 * Inventory service — receives goods against a PO, same template as the rest. Owns
 * `aura_inventory_grns`, goes through the access seam, and emits `inventory.grn.*` on the
 * spine. References the PO + carries supplier/project down by snapshot — no DB join.
 */
@Injectable()
export class GoodsReceiptService {
  private readonly logger = new Logger('Inventory');

  constructor(
    @Inject(GOODS_RECEIPT_STORE) private readonly store: GoodsReceiptStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  async create(input: NewGoodsReceipt): Promise<GoodsReceipt> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'inventory.grn.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const grn = makeGoodsReceipt(input);
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
      },
    });

    // Atomic outbox: the GRN row and its event commit in ONE transaction (or both roll back).
    await this.tx.run(async (handle) => {
      await this.store.createWithClient(handle, grn);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`GRN created: ${grn.title} (${grn.id}) value=${grn.value}`);
    return grn;
  }

  get(id: Id): Promise<GoodsReceipt | null> {
    return this.store.get(id);
  }

  list(filter?: GoodsReceiptFilter): Promise<GoodsReceipt[]> {
    return this.store.list(filter);
  }
}
