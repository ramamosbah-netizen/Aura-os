import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, assertSameTenant, type HealthSignal, type Id, makeEvent, type OrgLevel, sameTenantOrNull, businessDate } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  RFQ_EVENT,
  type Rfq,
  type RfqInvitation,
  type RfqQuote,
  type NewRfq,
  type NewRfqQuote,
  assertInvitationsEditable,
  inviteSupplier,
  makeRfq,
  makeRfqQuote, sendRfq } from './domain/rfq';
import { RFQ_STORE, type RfqFilter, type RfqStore } from './rfq-store';
import { PURCHASE_REQUEST_STORE, type PurchaseRequestStore } from './purchase-request-store';
import { SUPPLIER_STORE, type SupplierStore } from './supplier-store';

/**
 * RFQ service — the sourcing step (PR → RFQ → quotes → award → PO). Owns
 * `aura_procurement_rfqs` + its quotes, goes through the access seam, and emits
 * `procurement.rfq.*` on the spine.
 */
@Injectable()
export class RfqService {
  private readonly logger = new Logger('RFQ');

  constructor(
    @Inject(RFQ_STORE) private readonly store: RfqStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    // Needed only to resolve an RFQ to a project: an RFQ carries `prId`, never `projectId`.
    // Same module, so no ADR-0004 edge — Procurement reading its own request register.
    @Optional() @Inject(PURCHASE_REQUEST_STORE) private readonly requests: PurchaseRequestStore | null = null,
    // The supplier master, read to address an enquiry to a supplier that exists (BUY-03). Same module.
    @Optional() @Inject(SUPPLIER_STORE) private readonly suppliers: SupplierStore | null = null,
    // NO PURCHASE-ORDER SERVICE. It was injected here so `award` could raise an order from the
    // winning quote's header number; that authority moved to `SourcingAwardService` (SUP-14), which
    // raises one order per supplier from the offer revision an approved recommendation selected.
    // Removing the dependency is part of the retirement: this service now has nothing to raise an
    // order WITH, so the old path cannot creep back as a convenience.
  ) {}

  async create(input: NewRfq): Promise<Rfq> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'procurement.rfq.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const rfq = makeRfq(input);
    await this.store.create(rfq);
    await this.events.append([
      makeEvent({
        type: RFQ_EVENT.rfqCreated,
        tenantId: rfq.tenantId,
        companyId: rfq.companyId,
        actorId: rfq.createdBy,
        aggregateType: 'procurement.rfq',
        aggregateId: rfq.id,
        payload: { title: rfq.title, status: rfq.status, pr: rfq.prId ? { id: rfq.prId, title: rfq.prTitle } : null },
      }),
    ]);
    this.logger.log(`RFQ created: ${rfq.title} (${rfq.id})`);
    return rfq;
  }

  async send(id: Id, sentBy: Id | null = null): Promise<Rfq> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'RFQ', id);
    const invitations = await this.store.listInvitations(id);
    const updated: Rfq = sendRfq(existing, sentBy, invitations);
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: RFQ_EVENT.rfqSent,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: sentBy,
        aggregateType: 'procurement.rfq',
        aggregateId: updated.id,
        // WHO IT WENT TO, on the event as well as the record: the spine is read as the history.
        payload: {
          title: updated.title,
          status: updated.status,
          suppliers: invitations.map((i) => ({ id: i.supplierId, name: i.supplierName })),
        },
      }),
    ]);
    this.logger.log(`RFQ ${updated.title} (${updated.id}) sent to ${invitations.length} supplier(s)`);
    return updated;
  }

  /**
   * ASK A SUPPLIER TO QUOTE (BUY-03). The supplier must be one from this tenant's master: an enquiry
   * addressed to a typed name cannot be matched to the quotation that answers it.
   *
   * The supplier's approval status is NOT a condition. The existing authority refuses an unapproved
   * supplier where the business commits — a purchase order or a framework agreement — and asking for
   * a price commits nothing. The status travels with the invitation so the screen can say so.
   */
  async invite(rfqId: Id, supplierId: Id, invitedBy: Id | null): Promise<RfqInvitation> {
    const rfq = assertSameTenant(await this.store.get(rfqId), this.tenant?.boundTenantId(), 'RFQ', rfqId);
    if (!this.suppliers) throw new Error('the supplier register is unavailable, so no supplier can be invited');
    const supplier = sameTenantOrNull(await this.suppliers.get(supplierId), rfq.tenantId);
    if (!supplier) throw new Error(`supplier ${supplierId} not found`);
    const invitation = inviteSupplier(rfq, supplier, await this.store.listInvitations(rfqId), invitedBy);
    await this.store.addInvitation(invitation);
    this.logger.log(`RFQ ${rfq.id}: ${supplier.name} invited to quote`);
    return invitation;
  }

  async withdrawInvitation(rfqId: Id, supplierId: Id): Promise<void> {
    const rfq = assertSameTenant(await this.store.get(rfqId), this.tenant?.boundTenantId(), 'RFQ', rfqId);
    assertInvitationsEditable(rfq);
    if (!(await this.store.listInvitations(rfqId)).some((i) => i.supplierId === supplierId)) {
      throw new Error(`invitation for supplier ${supplierId} not found on this enquiry`);
    }
    await this.store.removeInvitation(rfqId, supplierId);
  }

  /**
   * Who the enquiry is addressed to, each with the supplier's CURRENT approval status — a fact the
   * buyer should see before placing an order with them, read live rather than snapshotted.
   */
  async invitations(rfqId: Id): Promise<Array<RfqInvitation & { supplierStatus: string | null }>> {
    const list = await this.store.listInvitations(rfqId);
    return Promise.all(list.map(async (i) => ({
      ...i,
      supplierStatus: this.suppliers ? (await this.suppliers.get(i.supplierId))?.status ?? null : null,
    })));
  }

  async addQuote(input: NewRfqQuote): Promise<RfqQuote> {
    const rfq = await this.store.get(input.rfqId);
    if (!rfq) throw new Error(`RFQ ${input.rfqId} not found`);
    const quote = makeRfqQuote({ ...input, tenantId: rfq.tenantId });
    await this.store.addQuote(quote);
    await this.events.append([
      makeEvent({
        type: RFQ_EVENT.quoteReceived,
        tenantId: rfq.tenantId,
        companyId: rfq.companyId,
        actorId: null,
        aggregateType: 'procurement.rfq',
        aggregateId: rfq.id,
        payload: { supplier: quote.supplierName, amount: quote.amount },
      }),
    ]);
    this.logger.log(`RFQ ${rfq.id} quote from ${quote.supplierName}: ${quote.amount}`);
    return quote;
  }

  /**
   * `award` IS DELETED (SUP-14).
   *
   * It marked the winning quote, rejected the rest, closed the RFQ — and raised a purchase order
   * valued at `winner.amount`: one header figure, NO LINES. A purchase order with no lines cannot be
   * received against line by line, cannot be matched to an invoice line by line, and states no
   * currency the supplier quoted in. It also asked nothing about whether the winning offer was
   * technically compliant, or whether the person clicking Award was allowed to commit that amount.
   *
   * An award is now `POST /procurement/rfqs/recommendations/:id/award`: an approved recommendation,
   * one purchase order per supplier, each in that supplier's own currency with the lines they
   * quoted, refused if the recommendation is not approved or has gone stale.
   *
   * `no-legacy-award.fitness.test.ts` fails if this method, its route, or `lowestQuote` return.
   */

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Rfq | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  /**
   * The RFQ with its legacy quotes. It no longer returns a `recommended` quote: that field was
   * `lowestQuote`, and a sort by an incomparable number is not a recommendation (SUP-13).
   */
  async getWithQuotes(id: Id): Promise<{ rfq: Rfq; quotes: RfqQuote[]; invitations: Array<RfqInvitation & { supplierStatus: string | null }> } | null> {
    const rfq = await this.store.get(id);
    if (!rfq) return null;
    return { rfq, quotes: await this.store.listQuotes(id), invitations: await this.invitations(id) };
  }

  /**
   * Procurement's own verdict on SOURCING readiness — §24-Procurement.
   *
   * Deliberately narrow, and the narrowness is the point. This reports one thing only:
   *
   *   A request for quotation is past the date Procurement itself set for it, and is still out.
   *
   * It does NOT say material will arrive late, and it must never be read that way. Procurement
   * models no required-on-site date, no promised or expected delivery date, no lead time and no
   * long-lead flag — checked at the schema, not just the model. So nothing here can support a
   * claim about delivery, and the signal that would make that claim reports UNKNOWN rather than
   * guessing. This one says only that a sourcing step is late against its own plan.
   *
   * NO INVENTED THRESHOLDS. Procurement declares no rule distinguishing one day overdue from
   * thirty, so none is invented here. Every overdue RFQ reports at the same level, and that level
   * is WATCH — the lowest that can be justified. An overdue quote deadline is worth knowing;
   * calling it AT_RISK would assert a consequence for delivery that the data cannot support.
   *
   * WHY THE STATUS CHECK MATTERS. `sent` is what proves the RFQ is still outstanding. An awarded
   * or closed RFQ whose date passed long ago is finished business, and counting it would produce a
   * phantom concern that never clears — the same trap the drawing-submission lineage avoids.
   *
   * TWO NULLABLE HOPS, STATED OPENLY. An RFQ reaches a project only through `prId → PR.projectId`,
   * and both `prId` and `dueDate` are nullable. So CLEAR here means "no DATED RFQ RAISED FOR THIS
   * PROJECT is past its date" — not "all sourcing is on time". An RFQ with no request behind it
   * belongs to no project and is evidence about none.
   */
  async readProjectProcurementSourcingReadiness(
    tenantId: Id,
    projectId: Id,
    today = businessDate(),
  ): Promise<HealthSignal> {
    const href = `/procurement/rfqs?projectId=${encodeURIComponent(projectId)}`;
    if (!this.requests) {
      // Cannot resolve RFQ → project without the request register, and guessing is not an option.
      return {
        id: 'procurement-sourcing-readiness',
        domain: 'procurement',
        state: 'UNKNOWN',
        cause: 'PROVIDER_UNAVAILABLE',
        reason: 'The purchase-request register could not be read, and an RFQ reaches a project only through its request.',
      };
    }

    // ASKED OF THE STORES, not filtered out of two capped lists (TC-GATE-19).
    //
    // Both reads here were `list({ tenantId })`, which stops at a HUNDRED ROWS and is scoped to
    // the whole tenant rather than this project. Any tenant with a hundred purchase requests —
    // which is a small tenant — lost the project's requests off the end, `mine` came back without
    // them, no RFQ could then be matched to the project, and this signal reported CLEAR.
    //
    // A health signal is read as "someone looked". Reporting CLEAR because the read was truncated
    // is the one failure mode it must not have, and it is the reason this gate exists.
    const prIds = await this.requests.listIdsForProject(tenantId, projectId);
    const overdue = (await this.store.listByPrIds(tenantId, prIds))
      .filter((r) => r.status === 'sent' && r.dueDate !== null && r.dueDate < today);

    if (overdue.length === 0) {
      return { id: 'procurement-sourcing-readiness', domain: 'procurement', state: 'CLEAR' };
    }
    return {
      id: 'procurement-sourcing-readiness',
      domain: 'procurement',
      state: 'WATCH',
      reason: `${overdue.length} request${overdue.length === 1 ? '' : 's'} for quotation past the quote deadline and still out to suppliers.`,
      href,
      measure: { value: overdue.length },
    };
  }

  list(filter?: RfqFilter): Promise<Rfq[]> {
    return this.store.list(filter);
  }

  listPaged(filter: RfqFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
