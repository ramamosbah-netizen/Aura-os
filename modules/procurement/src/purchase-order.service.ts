import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, NumberingService, AuditService } from '@aura/core';
import { PROCUREMENT_EVENT, type PurchaseOrder, type PurchaseOrderStatus, type NewPurchaseOrder, makePurchaseOrder } from './domain/purchase-order';
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
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  async create(input: NewPurchaseOrder): Promise<PurchaseOrder> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'procurement.po.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const po = makePurchaseOrder(input);
    if (!po.reference) {
      po.reference = await this.numbering.generateNextNumber(
        po.tenantId,
        po.companyId,
        'procurement',
        'purchase-order',
        'PO',
      );
    }

    await this.store.create(po);

    await this.audit.log(
      po.tenantId,
      po.companyId,
      po.createdBy,
      'procurement',
      'purchase-order',
      po.id,
      'create',
      { reference: po.reference, value: po.value, supplierName: po.supplierName },
    );

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

  async changeStatus(id: Id, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`PO ${id} not found`);
    const updated: PurchaseOrder = { ...existing, status };
    await this.store.update(updated);

    let eventType: string = PROCUREMENT_EVENT.poUpdated;
    if (status === 'issued') {
      eventType = PROCUREMENT_EVENT.poIssued;
    } else if (status === 'closed') {
      eventType = PROCUREMENT_EVENT.poClosed;
    }

    await this.events.append([
      makeEvent({
        type: eventType,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: null,
        aggregateType: 'procurement.po',
        aggregateId: updated.id,
        payload: {
          title: updated.title,
          status: updated.status,
          value: updated.value,
          supplier: updated.supplierName,
          project: updated.projectId ? { id: updated.projectId, name: updated.projectName } : null,
        },
      }),
    ]);
    this.logger.log(`PO ${updated.title} (${updated.id}) status changed to ${status}`);
    return updated;
  }

  get(id: Id): Promise<PurchaseOrder | null> {
    return this.store.get(id);
  }

  list(filter?: PurchaseOrderFilter): Promise<PurchaseOrder[]> {
    return this.store.list(filter);
  }
}
