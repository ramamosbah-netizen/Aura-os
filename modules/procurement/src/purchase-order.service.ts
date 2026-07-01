import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, NumberingService, AuditService, TX_RUNNER, type TxRunner } from '@aura/core';
import { PROCUREMENT_EVENT, type PurchaseOrder, type PurchaseOrderStatus, type NewPurchaseOrder, makePurchaseOrder } from './domain/purchase-order';
import { requiredApproval } from './domain/approval-matrix';
import { PURCHASE_ORDER_STORE, type PurchaseOrderFilter, type PurchaseOrderStore } from './purchase-order-store';
import { SUPPLIER_STORE, type SupplierStore } from './supplier-store';
import { isApproved } from './domain/supplier';

const CREATE_PO = 'procurement.po.create';

/**
 * Procurement service — the operate-side spend module. Owns `aura_procurement_purchase_orders`,
 * emits `procurement.po.*` on the spine. References a project by id + snapshot — no DB join.
 *
 * Create dispatches through the kernel `CommandBus` (validate → authz → idempotency → one tx
 * → atomic row + outbox event); the reference number is generated inside the command handler.
 * `changeStatus` keeps its inline atomic TX_RUNNER write (its po.issued event is consumed
 * downstream by Inventory/Finance).
 */
@Injectable()
export class PurchaseOrderService implements OnModuleInit {
  private readonly logger = new Logger('Procurement');

  constructor(
    @Inject(PURCHASE_ORDER_STORE) private readonly store: PurchaseOrderStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly commands: CommandBus,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    @Inject(SUPPLIER_STORE) private readonly suppliers: SupplierStore,
  ) {}

  onModuleInit(): void {
    this.commands.register<NewPurchaseOrder, PurchaseOrder>({
      name: CREATE_PO,
      permission: 'procurement.po.create',
      validate: (input) => {
        if (!input.title || !input.title.trim()) throw new Error('purchase order title is required');
      },
      handler: async (command, tx) => {
        const po = makePurchaseOrder(command.payload);
        if (!po.reference) {
          po.reference = await this.numbering.generateNextNumber(
            po.tenantId,
            po.companyId,
            'procurement',
            'purchase-order',
            'PO',
          );
        }
        const event = makeEvent({
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
        });
        await this.store.createWithClient(tx, po);
        await this.events.appendWithClient(tx, [event]);
        this.logger.log(`PO created: ${po.title} (${po.id}) value=${po.value}`);
        return po;
      },
    });
  }

  async create(input: NewPurchaseOrder, idempotencyKey?: string | null): Promise<PurchaseOrder> {
    // Approved-vendor enforcement: a PO bound to a supplier must reference an APPROVED
    // supplier in the master, and the snapshot name is taken from it (no free-text drift).
    if (input.supplierId) {
      const supplier = await this.suppliers.get(input.supplierId);
      if (!supplier || supplier.tenantId !== input.tenantId) throw new Error(`supplier ${input.supplierId} not found`);
      if (!isApproved(supplier)) throw new Error(`supplier ${supplier.name} is not approved (status ${supplier.status})`);
      input = { ...input, supplierName: supplier.name };
    }
    const po = await this.commands.execute<PurchaseOrder>({
      id: newId(),
      name: CREATE_PO,
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorId: input.createdBy ?? null,
      payload: input,
      idempotencyKey: idempotencyKey ?? null,
    });
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
    return po;
  }

  /** Submit a PO for approval. Auto-approves below the matrix threshold; otherwise → pending_approval. */
  async submitForApproval(id: Id): Promise<PurchaseOrder> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`PO ${id} not found`);
    const req = requiredApproval(existing.value);
    return this.transition(existing, req.autoApproved ? 'approved' : 'pending_approval', PROCUREMENT_EVENT.poUpdated, {
      requiredLevel: req.level, requiredLabel: req.label, autoApproved: req.autoApproved,
    });
  }

  /**
   * Approve a PO. The approver's level must meet the value's required approval level
   * (the matrix); under-level approval is rejected.
   */
  async approve(id: Id, approverLevel: number): Promise<PurchaseOrder> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`PO ${id} not found`);
    const req = requiredApproval(existing.value);
    if (Number(approverLevel) < req.level) {
      throw new Error(`approval level ${approverLevel} is below the required level ${req.level} (${req.label}) for value ${existing.value}`);
    }
    return this.transition(existing, 'approved', PROCUREMENT_EVENT.poApproved, {
      approverLevel: Number(approverLevel), requiredLevel: req.level, requiredLabel: req.label,
    });
  }

  async changeStatus(id: Id, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`PO ${id} not found`);

    // Approval gate: a PO above the auto-approve threshold must be 'approved' before it can issue.
    if (status === 'issued' && existing.status !== 'approved' && !requiredApproval(existing.value).autoApproved) {
      throw new Error(`PO ${existing.reference ?? id} (value ${existing.value}) requires approval before it can be issued`);
    }

    const updated: PurchaseOrder = { ...existing, status };

    let eventType: string = PROCUREMENT_EVENT.poUpdated;
    if (status === 'issued') {
      eventType = PROCUREMENT_EVENT.poIssued;
    } else if (status === 'closed') {
      eventType = PROCUREMENT_EVENT.poClosed;
    }

    const event = makeEvent({
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
    });

    // Atomic: the status update and its event commit together.
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`PO ${updated.title} (${updated.id}) status changed to ${status}`);
    return updated;
  }

  /** Atomic status transition + spine event (shared by submit/approve/changeStatus paths). */
  private async transition(
    existing: PurchaseOrder,
    status: PurchaseOrderStatus,
    eventType: string,
    extra: Record<string, unknown> = {},
  ): Promise<PurchaseOrder> {
    const updated: PurchaseOrder = { ...existing, status };
    const event = makeEvent({
      type: eventType,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'procurement.po',
      aggregateId: updated.id,
      payload: {
        title: updated.title, status: updated.status, value: updated.value, supplier: updated.supplierName,
        project: updated.projectId ? { id: updated.projectId, name: updated.projectName } : null,
        ...extra,
      },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`PO ${updated.title} (${updated.id}) → ${status}`);
    return updated;
  }

  get(id: Id): Promise<PurchaseOrder | null> {
    return this.store.get(id);
  }

  list(filter?: PurchaseOrderFilter): Promise<PurchaseOrder[]> {
    return this.store.list(filter);
  }

  listPaged(filter: PurchaseOrderFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
