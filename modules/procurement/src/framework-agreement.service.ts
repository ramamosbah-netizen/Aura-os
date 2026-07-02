import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, NumberingService } from '@aura/core';
import {
  FRAMEWORK_EVENT,
  type FrameworkAgreement,
  type NewFrameworkAgreement,
  activateAgreement,
  makeFrameworkAgreement,
  recordCallOff,
  remainingValue,
  terminateAgreement,
} from './domain/framework-agreement';
import { FRAMEWORK_AGREEMENT_STORE, type FrameworkAgreementFilter, type FrameworkAgreementStore } from './framework-agreement-store';
import { SUPPLIER_STORE, type SupplierStore } from './supplier-store';
import { isApproved } from './domain/supplier';
import { type PurchaseOrder } from './domain/purchase-order';
import { PurchaseOrderService } from './purchase-order.service';

export interface CallOffInput {
  title: string;
  projectId?: Id | null;
  projectName?: string | null;
  value: number;
  createdBy?: Id | null;
}

/**
 * Framework-agreement service — blanket supplier agreements with a ceiling; call-offs
 * draw down the ceiling and raise a PO through the normal PO pipeline (approved-vendor
 * check, numbering, approval matrix downstream). Owns
 * `aura_procurement_framework_agreements` and emits `procurement.framework.*`.
 */
@Injectable()
export class FrameworkAgreementService {
  private readonly logger = new Logger('Procurement');

  constructor(
    @Inject(FRAMEWORK_AGREEMENT_STORE) private readonly store: FrameworkAgreementStore,
    @Inject(SUPPLIER_STORE) private readonly suppliers: SupplierStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly numbering: NumberingService,
    private readonly purchaseOrders: PurchaseOrderService,
  ) {}

  async create(input: NewFrameworkAgreement): Promise<FrameworkAgreement> {
    // Same approved-vendor rule as POs: agreements only with APPROVED suppliers,
    // name snapshot taken from the master.
    const supplier = await this.suppliers.get(input.supplierId);
    if (!supplier || supplier.tenantId !== input.tenantId) throw new Error(`supplier ${input.supplierId} not found`);
    if (!isApproved(supplier)) throw new Error(`supplier ${supplier.name} is not approved (status ${supplier.status})`);

    const fa = makeFrameworkAgreement({ ...input, supplierName: supplier.name });
    if (!fa.reference) {
      fa.reference = await this.numbering.generateNextNumber(fa.tenantId, fa.companyId, 'procurement', 'framework-agreement', 'FA');
    }
    await this.store.save(fa);
    await this.events.append([
      makeEvent({
        type: FRAMEWORK_EVENT.created,
        tenantId: fa.tenantId,
        companyId: fa.companyId,
        actorId: fa.createdBy,
        aggregateType: 'procurement.framework',
        aggregateId: fa.id,
        payload: { reference: fa.reference, supplierId: fa.supplierId, supplier: fa.supplierName, ceilingValue: fa.ceilingValue, validFrom: fa.validFrom, validTo: fa.validTo },
      }),
    ]);
    this.logger.log(`Framework agreement created: ${fa.reference} with ${fa.supplierName} ceiling=${fa.ceilingValue}`);
    return fa;
  }

  async activate(id: Id): Promise<FrameworkAgreement> {
    return this.transition(id, activateAgreement, FRAMEWORK_EVENT.activated);
  }

  async terminate(id: Id): Promise<FrameworkAgreement> {
    return this.transition(id, terminateAgreement, FRAMEWORK_EVENT.terminated);
  }

  /**
   * Call off against the agreement: validates the drawdown (active, in validity, within
   * the remaining ceiling), raises the PO through the standard pipeline, then persists
   * the drawdown + event.
   */
  async callOff(id: Id, input: CallOffInput): Promise<{ agreement: FrameworkAgreement; purchaseOrder: PurchaseOrder }> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`framework agreement ${id} not found`);

    const drawn = recordCallOff(existing, input.value); // validates before any side effect

    const purchaseOrder = await this.purchaseOrders.create(
      {
        tenantId: existing.tenantId,
        companyId: existing.companyId,
        title: input.title,
        supplierId: existing.supplierId,
        projectId: input.projectId ?? null,
        projectName: input.projectName ?? null,
        value: Number(input.value),
        createdBy: input.createdBy ?? null,
      },
      `framework-calloff:${existing.id}:${existing.calledOffValue}:${input.value}`,
    );

    await this.store.save(drawn);
    await this.events.append([
      makeEvent({
        type: FRAMEWORK_EVENT.callOff,
        tenantId: drawn.tenantId,
        companyId: drawn.companyId,
        actorId: input.createdBy ?? null,
        aggregateType: 'procurement.framework',
        aggregateId: drawn.id,
        payload: { reference: drawn.reference, poId: purchaseOrder.id, poReference: purchaseOrder.reference, value: Number(input.value), calledOffValue: drawn.calledOffValue, remainingValue: remainingValue(drawn) },
      }),
    ]);
    this.logger.log(
      `Call-off ${input.value} against ${drawn.reference} → PO ${purchaseOrder.reference} (remaining ${remainingValue(drawn)})`,
    );
    return { agreement: drawn, purchaseOrder };
  }

  get(id: Id): Promise<FrameworkAgreement | null> {
    return this.store.get(id);
  }

  list(filter?: FrameworkAgreementFilter): Promise<FrameworkAgreement[]> {
    return this.store.list(filter);
  }

  listPaged(filter: FrameworkAgreementFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }

  private async transition(
    id: Id,
    fn: (fa: FrameworkAgreement) => FrameworkAgreement,
    eventType: string,
  ): Promise<FrameworkAgreement> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`framework agreement ${id} not found`);
    const updated = fn(existing);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: eventType,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: null,
        aggregateType: 'procurement.framework',
        aggregateId: updated.id,
        payload: { reference: updated.reference, status: updated.status },
      }),
    ]);
    this.logger.log(`Framework agreement ${updated.reference} → ${updated.status}`);
    return updated;
  }
}
