import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { PROCUREMENT_EVENT, type PurchaseOrder, type NewPurchaseOrder, makePurchaseOrder } from './domain/purchase-order';
import { PURCHASE_ORDER_STORE, type PurchaseOrderFilter, type PurchaseOrderStore } from './purchase-order-store';

/**
 * Procurement service — the operate-side spend module, same template as the deal chain.
 * Owns `aura_procurement_purchase_orders`, goes through the access seam, and emits
 * `procurement.po.*` on the spine. References a project by id + snapshot — no DB join.
 */
@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger('Procurement');

  constructor(
    @Inject(PURCHASE_ORDER_STORE) private readonly store: PurchaseOrderStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
  ) {}

  async create(input: NewPurchaseOrder): Promise<PurchaseOrder> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'procurement.po.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const po = makePurchaseOrder(input);
    await this.store.create(po);
    await this.events.append([
      makeEvent({
        type: PROCUREMENT_EVENT.poCreated,
        tenantId: po.tenantId,
        companyId: po.companyId,
        actorId: po.createdBy,
        aggregateType: 'procurement.po',
        aggregateId: po.id,
        payload: {
          title: po.title,
          status: po.status,
          value: po.value,
          supplier: po.supplierName,
          project: po.projectId ? { id: po.projectId, name: po.projectName } : null,
        },
      }),
    ]);
    this.logger.log(`PO created: ${po.title} (${po.id}) value=${po.value}`);
    return po;
  }

  get(id: Id): Promise<PurchaseOrder | null> {
    return this.store.get(id);
  }

  list(filter?: PurchaseOrderFilter): Promise<PurchaseOrder[]> {
    return this.store.list(filter);
  }
}
