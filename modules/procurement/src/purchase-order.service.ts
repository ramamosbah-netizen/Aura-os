import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { type OrgLevel, assertSameTenant, diffFields, type Id, makeEvent, newId, sameTenantOrNull } from '@aura/shared';
import { AccessService, CommandBus, EVENT_STORE, type EventStore, NumberingService, AuditService, TX_RUNNER, type TxHandle, type TxRunner, TenantContext } from '@aura/core';
import { PROCUREMENT_EVENT, type PurchaseOrder, type PurchaseOrderStatus, type NewPurchaseOrder, makePurchaseOrder } from './domain/purchase-order';
import { requiredApproval } from './domain/approval-matrix';
import { PURCHASE_ORDER_STORE, type PurchaseOrderFilter, type PurchaseOrderStore } from './purchase-order-store';
import { SUPPLIER_STORE, type SupplierStore } from './supplier-store';
import { isApproved } from './domain/supplier';
import { PO_LINE_STORE, type PurchaseOrderLineStore } from './purchase-order-line-store';
import { PO_POSITION_PORT, type PoPositionPort } from './po-position.port';
import { cancellationPosition, closureReadiness, issuability, type OrderPosition } from './domain/purchase-order-lifecycle';
import type { PurchaseOrderLine } from './domain/purchase-order-line';
import { orderCommitment } from './domain/purchase-order-line';
import { type AcceptedByLine, receiptOf, receiptStatus, type RejectedByLine } from './domain/order-receipt';
import { TenderPricingBoundary } from './tender-pricing-boundary.service';

/** Optional quality gate — injected when the Quality module is loaded. */
export const QUALITY_GATE = Symbol('QUALITY_GATE');
export interface QualityGate {
  /**
   * Procurement's owned supplier rule: a supplier with a REJECTED material approval request on this
   * project cannot have a purchase order issued against it. It is a supplier-risk control and says
   * nothing about whether the material on THIS order is the approved one — that needs a canonical
   * purchased-material identity, which Wave 4 owns (`BUY-01`).
   */
  checkMaterialApprovalGate(
    tenantId: string, projectId: string, supplierName: string,
  ): Promise<{ passed: boolean; reason?: string }>;
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
    /**
     * This order's LINES. Optional and last — several suites build this service positionally, and
     * inserting a parameter anywhere else silently rebinds every later one. A null store means "no
     * lines", which is exactly right for an order raised before lines existed.
     */
    @Optional() @Inject(PO_LINE_STORE) private readonly lines: PurchaseOrderLineStore | null = null,
    /**
     * What has already happened against an order, from Inventory and Finance (ADR-0004: the app
     * layer composes it). Optional so an in-memory test can build this service; cancelling and
     * closing REFUSE without it rather than assuming nothing has happened.
     */
    @Optional() @Inject(PO_POSITION_PORT) private readonly positions: PoPositionPort | null = null,
    /**
     * The authority to UNDO a commitment. Last and optional so the several suites that build this
     * service positionally keep working — inserting a parameter anywhere else silently rebinds every
     * later one, which this file has been bitten by before. Absent, `cancel` REFUSES an attributed
     * cancellation rather than skipping the check: a guard that quietly does not run is worse than
     * no guard, because it reads as one.
     */
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
    // THE TENDER-PRICING BOUNDARY — one rule, asked by every door (see tender-pricing-boundary.service).
    // Explicit token: an @Optional() union without one reflects as Object and arrives as null.
    @Optional() @Inject(TenderPricingBoundary) private readonly pricingBoundary: TenderPricingBoundary | null = null,
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
      handler: (command, tx) => this.raise(tx, command.payload),
    });
  }

  /**
   * RAISE AN ORDER INSIDE A TRANSACTION THE CALLER OWNS.
   *
   * Everything that makes a purchase order real happens here: the number, the row and the
   * `po.created` event that carries the commitment to project cost and the ordered quantity to the
   * ledger. Both ways into it — the command bus, and an award raising several orders as one act —
   * run exactly this, so neither can drift into being a lesser kind of purchase order.
   *
   * It is exposed because SUP-14 cannot use `create`: that opens its OWN transaction through the
   * command bus, and an award that raised each order in a transaction of its own could leave one
   * supplier ordered from and the next not. The award owns one transaction and passes it in.
   *
   * WHAT THE CALLER TAKES ON by using this instead of `create`: the permission check and the
   * idempotency record belong to the bus. `SourcingAwardService` answers for both — the route
   * declares `procurement.rfq.award`, and a unique index on the recommendation selection makes a
   * second order for the same decision impossible rather than merely unlikely (migration 0358).
   */
  async raise(tx: TxHandle | null, input: NewPurchaseOrder): Promise<PurchaseOrder> {
    // Before anything is numbered or written: an order from a pricing exercise is not an order.
    await this.pricingBoundary?.assertMayRaiseOrder({ prId: input.prId, rfqId: input.rfqId }, input.tenantId);
    const checked = await this.withApprovedSupplier(input);
    const po = makePurchaseOrder(checked);
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
  }

  /**
   * Approved-vendor enforcement: an order bound to a supplier must reference an APPROVED supplier in
   * the master, and the snapshot name is taken from there so it cannot drift from it.
   */
  private async withApprovedSupplier(input: NewPurchaseOrder): Promise<NewPurchaseOrder> {
    if (!input.supplierId) return input;
    const supplier = await this.suppliers.get(input.supplierId);
    if (!supplier || supplier.tenantId !== input.tenantId) throw new Error(`supplier ${input.supplierId} not found`);
    if (!isApproved(supplier)) throw new Error(`supplier ${supplier.name} is not approved (status ${supplier.status})`);
    return { ...input, supplierName: supplier.name };
  }

  async create(input: NewPurchaseOrder, idempotencyKey?: string | null): Promise<PurchaseOrder> {
    await this.pricingBoundary?.assertMayRaiseOrder({ prId: input.prId, rfqId: input.rfqId }, input.tenantId);
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
  /**
   * Submit for approval — and, below the threshold, RECORD THE APPROVAL rather than skip it (J3-01).
   *
   * The auto-approve tier used to mean "this order needs no approval", implemented as a jump
   * straight to `approved` with nothing written down: no approver, no time, no level, no note that
   * the matrix had even been consulted. An order issued that way could not say, afterwards, whether
   * it had been approved automatically or whether somebody had simply set its status.
   *
   * It now means "the approval is taken by the matrix on nobody's behalf" — a fact with a basis, a
   * time and a level. The difference is invisible in a status and decisive in an audit, and it is
   * what makes `issued` reachable ONLY from `approved` a rule rather than an obstacle.
   */
  async submitForApproval(id: Id): Promise<PurchaseOrder> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);
    const lines = this.lines ? await this.lines.listForOrder(existing.id, existing.tenantId) : [];
    // The threshold is read against what the order COMMITS US TO — lines plus the freight quoted on
    // the header (SUP-14) — not what its lines come to.
    const req = requiredApproval(orderCommitment(existing, lines).exTax);
    if (!req.autoApproved) {
      return this.transition(existing, 'pending_approval', PROCUREMENT_EVENT.poUpdated, {
        requiredLevel: req.level, requiredLabel: req.label, autoApproved: false,
      });
    }

    const at = new Date().toISOString();
    return this.transition(
      {
        ...existing,
        approvedBy: this.actor(null), approvedAt: at,
        approvalLevel: req.level, approvalBasis: 'automatic',
      },
      'approved', PROCUREMENT_EVENT.poApproved,
      {
        requiredLevel: req.level, requiredLabel: req.label, autoApproved: true,
        approvalBasis: 'automatic', approvedAt: at,
      },
    );
  }

  /**
   * Approve a PO. The approver's level must meet the value's required approval level
   * (the matrix); under-level approval is rejected.
   */
  async approve(id: Id, approverLevel: number): Promise<PurchaseOrder> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);
    const lines = this.lines ? await this.lines.listForOrder(existing.id, existing.tenantId) : [];
    const req = requiredApproval(orderCommitment(existing, lines).exTax);
    if (Number(approverLevel) < req.level) {
      throw new Error(`approval level ${approverLevel} is below the required level ${req.level} (${req.label}) for value ${existing.value}`);
    }
    const at = new Date().toISOString();
    return this.transition(
      {
        ...existing,
        approvedBy: this.actor(null), approvedAt: at,
        approvalLevel: Number(approverLevel), approvalBasis: 'manual',
      },
      'approved', PROCUREMENT_EVENT.poApproved,
      {
        approverLevel: Number(approverLevel), requiredLevel: req.level, requiredLabel: req.label,
        approvalBasis: 'manual', approvedAt: at,
      },
    );
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

  /**
   * THE GENERIC STATUS PATH, REFUSED (J3-01).
   *
   * It accepted `draft`, `issued`, `closed` and `cancelled` under ONE permission —
   * `procurement.po.update` — which is how a Buyer could issue an order to a supplier, cancel a
   * Director-approved order of 90,000 (reversing its committed cost in the ledger) and close one.
   * The record was written as "can set status=approved"; refusing that one string left every other
   * transition exactly as it was, which is why it stayed open.
   *
   * The lesson is the shape, not the value: A GENERIC MUTATION PATH MUST NEVER OWN A GOVERNED
   * LIFECYCLE TRANSITION. `issue`, `cancel` and `close` are commands below, each with its own
   * authority and its own conditions, beside `submitForApproval` and `approve` which always were.
   *
   * It refuses rather than disappearing so a caller still pointing here is told where each act went,
   * and `no-generic-po-status.fitness.test.ts` fails if it starts writing again.
   */
  async changeStatus(id: Id, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
    void id;
    throw new Error(
      `a purchase order cannot be moved to ${status} through a generic status update — each step is ` +
      'its own governed act with its own authority: submit, approve, issue, cancel or close',
    );
  }

  /**
   * ISSUE — the commitment goes out to the supplier.
   *
   * Reachable ONLY from `approved`, at every value. The old path allowed `draft → issued` whenever
   * the value fell under the auto-approve threshold, which read as "small orders need no approval"
   * and meant "small orders are issued with no approval fact anywhere". The threshold decides WHO
   * approves — nobody, automatically — not WHETHER the step happens.
   */
  async issue(id: Id, actorId: Id | null): Promise<PurchaseOrder> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);
    const verdict = issuability(existing);
    if (!verdict.allowed) throw new Error(verdict.detail);

    // The quality gate keeps its place: a supplier with rejected material approvals on this project
    // does not get an order sent to them, however well approved it is.
    if (this.qualityGate && existing.projectId && existing.supplierName) {
      const gate = await this.qualityGate.checkMaterialApprovalGate(existing.tenantId, existing.projectId, existing.supplierName);
      if (!gate.passed) throw new Error(`Quality gate blocked PO issuance: ${gate.reason}`);
    }

    const at = new Date().toISOString();
    return this.transition(
      { ...existing, issuedBy: this.actor(actorId), issuedAt: at },
      'issued', PROCUREMENT_EVENT.poIssued,
      { issuedBy: this.actor(actorId), issuedAt: at, cbsNodeId: existing.cbsNodeId, boqItemId: existing.boqItemId },
    );
  }

  /**
   * CANCEL — undoing a commitment, bounded by what is still undoable.
   *
   * The approval matrix is checked on the REMAINING commitment, mirroring the rule SUP-13 uses for
   * standing down an approved recommendation: undoing something approved needs the authority the
   * approval needed. A reason is required, and both are recorded on the order rather than inferred
   * later from a status.
   *
   * `cancelledValue` is what actually gets reversed — NOT the order's value. An order part delivered
   * has part become real, and the ledger reverses exactly this figure.
   */
  async cancel(id: Id, input: { actorId: Id | null; reason: string }): Promise<PurchaseOrder> {
    return this.tx.run(async (handle) => {
      /**
       * HELD WHILE THE DECISION IS MADE. Reading the position and then writing the cancellation
       * leaves a window in which a delivery lands — and the cancellation then reverses a commitment
       * that goods had already arrived against. A receipt reconciles onto this same row, so holding
       * it here is what a concurrent receipt blocks on.
       */
      const existing = assertSameTenant(
        await this.store.getForUpdate(id, handle), this.tenant?.boundTenantId(), 'PO', id);
      const lines = this.lines ? await this.lines.listForOrder(existing.id, existing.tenantId) : [];
      const committed = orderCommitment(existing, lines).exTax;
      const position = await this.position(existing, lines);

      const verdict = cancellationPosition(existing, committed, position, input.reason);
      if (!verdict.allowed) throw new Error(verdict.detail);

    /**
     * The authority to undo. Checked on what is being reversed rather than on the order's face
     * value: cancelling the last 2,000 of a 500,000 order is not a board-level act, and pretending
     * it is would push people to work around the control rather than through it.
     */
    if (input.actorId) {
      if (!this.access) {
        throw new Error('the authority to cancel this purchase order cannot be checked, so it is not cancelled');
      }
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      if (existing.companyId) orgPath.push({ level: 'company', id: existing.companyId });
      this.access.assertApprovalAuthority(
        input.actorId,
        { permission: 'procurement.po.approve', orgPath, amount: verdict.cancellable },
        `cancelling ${verdict.cancellable} of this purchase order`,
      );
    }

    const at = new Date().toISOString();
    return this.write(
      handle,
      {
        ...existing,
        cancelledBy: this.actor(input.actorId), cancelledAt: at,
        cancellationReason: input.reason.trim(), cancelledValue: verdict.cancellable,
      },
      'cancelled', PROCUREMENT_EVENT.poUpdated,
      {
        // THE REVERSAL AMOUNT, carried so the cost engine reverses what is actually cancellable and
        // not the order's value. `value` stays in the payload for every other reader.
        cancelledValue: verdict.cancellable,
        settledValue: verdict.settled,
        cancellationReason: input.reason.trim(),
        cancelledBy: this.actor(input.actorId),
        cbsNodeId: existing.cbsNodeId,
        boqItemId: existing.boqItemId,
        orderedQuantity: existing.orderedQuantity,
        unit: existing.unit,
        /**
         * The share of the ordered quantity that was never delivered, so the quantity ledger
         * reverses only that. Proportional to the value cancelled, because the header carries one
         * ordered quantity and no line-level receipt mapping to apportion it any other way — stated
         * rather than assumed exact.
         */
        cancellableQuantityRatio: committed > 0 ? verdict.cancellable / committed : 1,
      },
      );
    });
  }

  /**
   * CLOSE — operational completion, which is NOT a variant of cancelling.
   *
   * Cancelling asks "may this person undo a commitment". Closing asks "is this order finished". They
   * share neither authority nor conditions, and treating close as a kind of cancel was the mistake
   * worth naming: it has no business asking for approval authority, and no business being possible
   * while something is still outstanding against the order.
   */
  async close(id: Id, actorId: Id | null): Promise<PurchaseOrder> {
    return this.tx.run(async (handle) => {
      // Held for the same reason as cancelling: "nothing is outstanding" must still be true when the
      // closure is written, not merely when it was checked.
      const existing = assertSameTenant(
        await this.store.getForUpdate(id, handle), this.tenant?.boundTenantId(), 'PO', id);
      const lines = this.lines ? await this.lines.listForOrder(existing.id, existing.tenantId) : [];
      const position = await this.position(existing, lines);

      const verdict = closureReadiness(existing, position);
      if (!verdict.allowed) throw new Error(verdict.detail);

      const at = new Date().toISOString();
      return this.write(
        handle,
        { ...existing, closedBy: this.actor(actorId), closedAt: at },
        'closed', PROCUREMENT_EVENT.poClosed,
        { closedBy: this.actor(actorId), closedAt: at },
      );
    });
  }

  /**
   * What has already happened against this order, from Inventory and Finance through the port.
   *
   * A position that CANNOT be read refuses rather than reporting zero. Zero would make every order
   * look freely cancellable and freshly closable at exactly the moment the system cannot see what
   * has happened to it — the §22 rule, at the point where it decides money.
   */
  private async position(order: PurchaseOrder, lines: PurchaseOrderLine[]): Promise<OrderPosition> {
    if (!this.positions) {
      throw new Error(
        'this purchase order\'s delivery and invoicing position cannot be read, so whether it may be ' +
        'cancelled or closed is not known',
      );
    }
    const answer = await this.positions.positionOf(order.tenantId, order.id, lines.map((l) => l.id));
    if (!answer.known) {
      throw new Error(
        `this purchase order's delivery and invoicing position cannot be read (${answer.reason}), so ` +
        'whether it may be cancelled or closed is not known',
      );
    }
    return {
      receivedValue: answer.receivedValue,
      invoicedValue: answer.invoicedValue,
      receipt: lines.length > 0 ? receiptOf(lines, answer.acceptedByLine, answer.rejectedByLine) : null,
    };
  }

  /**
   * Reconcile this order's delivery state from its LINES — `BUY-05`.
   *
   * The scalar path below could only ever answer a whole-order question with a single number that
   * belonged to no particular material. This answers the real one: each line is settled or still
   * owed, and the order is received only when every one of them is settled.
   *
   * Returns the order UNTOUCHED when the position implies nothing — an order with no lines has no
   * positions to measure, and an order where nothing has been accepted has not changed. Moving it
   * in either case would be concluding from an absence, which is the defect this replaces.
   */
  async reconcileReceiptFromLines(
    id: Id, accepted: AcceptedByLine, rejected: RejectedByLine = {},
  ): Promise<PurchaseOrder> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);
    const orderLines = this.lines ? await this.lines.listForOrder(existing.id, existing.tenantId) : [];
    const receipt = receiptOf(orderLines, accepted, rejected);
    const status = receiptStatus(receipt);

    if (status === null) {
      this.logger.log(
        `PO ${existing.title} (${existing.id}) left at '${existing.status}': ` +
        (receipt.determinable ? 'nothing accepted yet' : 'no lines, so its delivery position cannot be measured'),
      );
      return existing;
    }
    if (existing.status === status) return existing;

    return this.transition(existing, status, PROCUREMENT_EVENT.poUpdated, {
      // The exposure a manager reads: what is still owed, and on which lines.
      outstandingValue: receipt.outstandingValue,
      outstandingLines: receipt.outstanding.map((l) => ({
        lineNo: l.lineNo, materialCode: l.materialCode,
        ordered: l.ordered, accepted: l.accepted, outstanding: l.outstanding, uom: l.uom,
      })),
      overReceivedLines: receipt.lines.filter((l) => l.overReceived).map((l) => l.lineNo),
    });
  }

  /** Reconcile the PO receipt state from the complete canonical GRN quantity for this order. */
  async reconcileReceipt(id: Id, receivedQuantity: number | null): Promise<PurchaseOrder> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PO', id);
    const ordered = existing.orderedQuantity;
    const received = receivedQuantity !== null && Number.isFinite(receivedQuantity)
      ? Math.max(0, Number(receivedQuantity))
      : null;
    // CONTAINMENT — completion is a CONCLUSION, and it needs both sides of the comparison.
    //
    // This expression used to fall through to 'received' whenever it could not conclude anything.
    // So a GRN against an order whose quantity nobody recorded closed the whole order: the absence
    // of a fact became the strongest possible statement about it, and the one that stops a buyer
    // chasing the rest of a delivery. An unknown is not a completion. Where the quantities cannot
    // answer "is this order finished?", the status stays exactly where it is and says so.
    //
    // `ordered <= 0` is held here too: an order recorded as zero quantity with goods received
    // against it contradicts itself, and a conclusion drawn from contradictory numbers is not
    // better than one drawn from missing ones.
    //
    // Deliberately NOT the partial-receipt model. This removes a false completion and nothing more;
    // receipt semantics are rebuilt once, on PO lines, where an order has items to receive against.
    if (ordered === null || ordered <= 0 || received === null) {
      this.logger.warn(
        `PO ${existing.title} (${existing.id}) left at '${existing.status}': ordered=${ordered ?? 'unknown'} ` +
        `received=${received ?? 'unknown'} — completion cannot be concluded from these quantities`,
      );
      return existing;
    }

    const status: PurchaseOrderStatus = received < ordered ? 'partially_received' : 'received';
    if (existing.status === status) return existing;
    return this.transition(existing, status, PROCUREMENT_EVENT.poUpdated, {
      orderedQuantity: ordered,
      receivedQuantity: received,
      // Both are known by here — the guard above returned on anything else.
      outstandingQuantity: Math.max(0, ordered - received),
    });
  }

  /** Atomic status transition + spine event (shared by submit/approve/changeStatus paths). */
  private transition(
    existing: PurchaseOrder,
    status: PurchaseOrderStatus,
    eventType: string,
    extra: Record<string, unknown> = {},
  ): Promise<PurchaseOrder> {
    return this.tx.run((handle) => this.write(handle, existing, status, eventType, extra));
  }

  /**
   * The row and its event, inside a transaction the CALLER owns — because cancelling and closing
   * decide on a position they must still hold when the write lands, so the decision and the write
   * are one transaction rather than two.
   */
  private async write(
    handle: TxHandle | null,
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
    await this.store.updateWithClient(handle, updated);
    await this.events.appendWithClient(handle, [event]);
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
