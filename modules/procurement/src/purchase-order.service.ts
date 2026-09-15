import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { assertSameTenant, diffFields, type Id, makeEvent, newId, sameTenantOrNull } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, NumberingService, AuditService, TX_RUNNER, type TxRunner, TenantContext } from '@aura/core';
import { PROCUREMENT_EVENT, type PurchaseOrder, type PurchaseOrderStatus, type NewPurchaseOrder, makePurchaseOrder } from './domain/purchase-order';
import { requiredApproval } from './domain/approval-matrix';
import { PURCHASE_ORDER_STORE, type PurchaseOrderFilter, type PurchaseOrderStore } from './purchase-order-store';
import { SUPPLIER_STORE, type SupplierStore } from './supplier-store';
import { isApproved } from './domain/supplier';

/** Optional quality gate — injected when the Quality module is loaded. */
export const QUALITY_GATE = Symbol('QUALITY_GATE');
export interface QualityGate {
  /**
   * May the material on this order be bought? (ENG-04)
   *
   * `verdict` travels with `passed` deliberately. A refusal and a silent pass are not the only two
   * outcomes: UNKNOWN — no material approval request on file at all — is permitted here, because
   * not every purchase needs one, but it must be SEEN rather than being indistinguishable from an
   * approval, which is exactly what it was before.
   */
  checkMaterialApprovalGate(
    tenantId: string, projectId: string, supplierName: string,
  ): Promise<{ passed: boolean; verdict?: string; reason?: string; references?: string[] }>;
}

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
    @Optional() @Inject(QUALITY_GATE) private readonly qualityGate?: QualityGate,
    // Explicit @Inject: a union-typed ctor param emits `Object` in design:paramtypes, which
    // silently injects null (see auth.service). Optional so in-memory tests need no context.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  /** The real acting user from the request context (ALS), falling back to the record's creator. */
  private actor(fallback: Id | null): Id | null {
    return this.tenant?.get().actorId ?? fallback;
  }

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
            cbsNodeId: po.cbsNodeId,
            // BOQ coding → the Quantity Ledger accrues ORDERED quantity on this measured line.
            boqItemId: po.boqItemId,
            orderedQuantity: po.orderedQuantity,
            unit: po.unit,
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
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);
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
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);
    const req = requiredApproval(existing.value);
    if (Number(approverLevel) < req.level) {
      throw new Error(`approval level ${approverLevel} is below the required level ${req.level} (${req.label}) for value ${existing.value}`);
    }
    return this.transition(existing, 'approved', PROCUREMENT_EVENT.poApproved, {
      approverLevel: Number(approverLevel), requiredLevel: req.level, requiredLabel: req.label,
    });
  }

  /** Update descriptive fields on a PO (title, reference, supplier snapshot).
   *  Value is NOT editable — committed project cost was posted as a delta at creation. */
  async update(id: Id, patch: Partial<Pick<PurchaseOrder, 'title' | 'reference' | 'supplierId' | 'supplierName'>>): Promise<PurchaseOrder> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);
    let normalized = patch;
    if (patch.supplierId !== undefined) {
      if (patch.supplierId === null) {
        normalized = { ...patch, supplierId: null, supplierName: null };
      } else {
        const supplier = await this.suppliers.get(patch.supplierId);
        if (!supplier || supplier.tenantId !== existing.tenantId) throw new Error(`supplier ${patch.supplierId} not found`);
        if (!isApproved(supplier)) throw new Error(`supplier ${supplier.name} is not approved (status ${supplier.status})`);
        normalized = { ...patch, supplierId: supplier.id, supplierName: supplier.name };
      }
    } else if (patch.supplierName !== undefined && existing.supplierId) {
      const supplier = await this.suppliers.get(existing.supplierId);
      if (!supplier || supplier.tenantId !== existing.tenantId) throw new Error(`supplier ${existing.supplierId} not found`);
      if (!isApproved(supplier)) throw new Error(`supplier ${supplier.name} is not approved (status ${supplier.status})`);
      normalized = { ...patch, supplierName: supplier.name };
    }
    const defined = Object.fromEntries(Object.entries(normalized).filter(([, v]) => v !== undefined));
    const updated: PurchaseOrder = { ...existing, ...defined };
    // Audit trail (P1-2 / gap register G-12): capture the field-level before→after so the timeline
    // can answer "who re-pointed this PO at a different supplier, and from whom" — previously the
    // event carried only the new state, and no actor at all.
    //
    // Note the PO has no line items: it is a header with a `value`, and value is deliberately NOT
    // editable here (committed project cost was posted as a delta at creation, so re-pricing a PO
    // in place would silently desync the cost ledger). The auditable surface is therefore the
    // supplier snapshot and the descriptive fields — a supplier swap being the one with real
    // commercial consequence.
    const changes = diffFields(existing, updated, ['title', 'reference', 'supplierId', 'supplierName']);
    const event = makeEvent({
      type: PROCUREMENT_EVENT.poUpdated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: this.actor(updated.createdBy ?? null),
      aggregateType: 'procurement.po',
      aggregateId: updated.id,
      payload: { title: updated.title, value: updated.value, changes },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`PO updated: ${updated.title} (${updated.id})`);
    return updated;
  }

  async changeStatus(id: Id, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);

    if (!['draft', 'issued', 'closed', 'cancelled'].includes(status)) {
      throw new Error(`PO status ${status} requires its governed submit, approve or receipt command`);
    }

    // Approval gate: a PO above the auto-approve threshold must be 'approved' before it can issue.
    if (status === 'issued' && existing.status !== 'approved' && !requiredApproval(existing.value).autoApproved) {
      throw new Error(`PO ${existing.reference ?? id} (value ${existing.value}) requires approval before it can be issued`);
    }

    // Quality gate (ENG-04): may the material on this order actually be bought?
    //
    // This used to refuse only a REJECTED request and pass otherwise, so a material nobody had ever
    // submitted — and one still with the consultant — issued exactly like an approved one. It now
    // refuses a decision against the material and one not yet made, and carries UNKNOWN through as
    // a stated fact rather than an invisible pass.
    let materialApproval: { passed: boolean; verdict?: string; reason?: string } | null = null;
    if (status === 'issued' && this.qualityGate && existing.projectId && existing.supplierName) {
      materialApproval = await this.qualityGate.checkMaterialApprovalGate(existing.tenantId, existing.projectId, existing.supplierName);
      if (!materialApproval.passed) {
        throw new Error(`Quality gate blocked PO issuance: ${materialApproval.reason}`);
      }
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
        // What the material approval actually said at the moment of issue (ENG-04). Recorded on the
        // event because "issued with no material approval on file" is a fact somebody will need to
        // answer for later, and a pass that leaves no trace is indistinguishable from an approval.
        materialApproval: materialApproval
          ? { verdict: materialApproval.verdict ?? null, reason: materialApproval.reason ?? null }
          : null,
        // Carried so the cost engine can REVERSE the committed cost when the PO is cancelled
        // (a negative ledger entry on this same cost line) — the ledger never mutates.
        cbsNodeId: updated.cbsNodeId,
        project: updated.projectId ? { id: updated.projectId, name: updated.projectName } : null,
        // BOQ coding → the Quantity Ledger reverses the ORDERED quantity on cancel too.
        boqItemId: updated.boqItemId,
        orderedQuantity: updated.orderedQuantity,
        unit: updated.unit,
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

  /** Reconcile the PO receipt state from the complete canonical GRN quantity for this order. */
  async reconcileReceipt(id: Id, receivedQuantity: number | null): Promise<PurchaseOrder> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);
    const ordered = existing.orderedQuantity;
    const received = receivedQuantity !== null && Number.isFinite(receivedQuantity)
      ? Math.max(0, Number(receivedQuantity))
      : null;
    const status: PurchaseOrderStatus = ordered !== null && ordered > 0 && received !== null && received < ordered
      ? 'partially_received'
      : 'received';
    if (existing.status === status) return existing;
    return this.transition(existing, status, PROCUREMENT_EVENT.poUpdated, {
      orderedQuantity: ordered,
      receivedQuantity: received,
      outstandingQuantity: ordered !== null && received !== null ? Math.max(0, ordered - received) : null,
    });
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

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<PurchaseOrder | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: PurchaseOrderFilter): Promise<PurchaseOrder[]> {
    return this.store.list(filter);
  }

  listPaged(filter: PurchaseOrderFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
