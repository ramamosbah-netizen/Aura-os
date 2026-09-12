import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, assertSameTenant, type HealthSignal, type Id, makeEvent, type OrgLevel, sameTenantOrNull } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  RFQ_EVENT,
  type Rfq,
  type RfqQuote,
  type NewRfq,
  type NewRfqQuote,
  makeRfq,
  makeRfqQuote,
  lowestQuote,
} from './domain/rfq';
import { RFQ_STORE, type RfqFilter, type RfqStore } from './rfq-store';
import { PURCHASE_REQUEST_STORE, type PurchaseRequestStore } from './purchase-request-store';
import { PurchaseOrderService } from './purchase-order.service';
import type { PurchaseOrder } from './domain/purchase-order';

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
    // Awarding an RFQ raises the PO that closes the sourcing chain (PROC-GAP-03). Same module, so no
    // ADR-0004 edge. Optional so an RFQ test without the PO service still runs; bound in the module,
    // it is what makes a competitively sourced spend trace back to the RFQ and PR it came from.
    @Optional() @Inject(PurchaseOrderService) private readonly purchaseOrders: PurchaseOrderService | null = null,
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

  async send(id: Id): Promise<Rfq> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'RFQ', id);
    const updated: Rfq = { ...existing, status: 'sent' };
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: RFQ_EVENT.rfqSent,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: null,
        aggregateType: 'procurement.rfq',
        aggregateId: updated.id,
        payload: { title: updated.title, status: updated.status },
      }),
    ]);
    this.logger.log(`RFQ ${updated.title} (${updated.id}) sent to vendors`);
    return updated;
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
   * Award the RFQ to a quote: the winner is marked awarded, the rest rejected, the RFQ closed-out —
   * and a purchase order is raised from the winning quote, closing the sourcing chain (PROC-GAP-03).
   */
  async award(rfqId: Id, quoteId: Id, actorId?: Id): Promise<{ rfq: Rfq; quotes: RfqQuote[]; po: PurchaseOrder | null }> {
    const rfq = assertSameTenant(await this.store.get(rfqId), this.tenant?.boundTenantId(), 'RFQ', rfqId);
    const quotes = await this.store.listQuotes(rfqId);
    const winner = quotes.find((q) => q.id === quoteId);
    if (!winner) throw new Error(`quote ${quoteId} not found on RFQ ${rfqId}`);

    for (const q of quotes) {
      const status = q.id === quoteId ? 'awarded' : 'rejected';
      if (q.status !== status) await this.store.updateQuote({ ...q, status });
    }
    const updated: Rfq = { ...rfq, status: 'awarded' };
    await this.store.update(updated);

    // Raise the PO from the winning quote, carrying the lineage the chain lacked. The RFQ knows only
    // its purchase request; the project comes from that request's snapshot, not a cross-module join.
    let po: PurchaseOrder | null = null;
    if (this.purchaseOrders) {
      const pr = rfq.prId && this.requests ? await this.requests.get(rfq.prId) : null;
      po = await this.purchaseOrders.create({
        tenantId: rfq.tenantId,
        companyId: rfq.companyId,
        title: `PO — ${rfq.title}`,
        supplierName: winner.supplierName,
        projectId: pr?.projectId ?? null,
        projectName: pr?.projectName ?? null,
        rfqId: rfq.id,
        prId: rfq.prId ?? null,
        value: winner.amount,
        status: 'draft',
        createdBy: actorId ?? null,
      });
    }

    await this.events.append([
      makeEvent({
        type: RFQ_EVENT.rfqAwarded,
        tenantId: rfq.tenantId,
        companyId: rfq.companyId,
        actorId: actorId ?? null,
        aggregateType: 'procurement.rfq',
        aggregateId: rfq.id,
        // quoteId lets the tendering estimate-sourcing reactor restamp components sourced from
        // this RFQ to the awarded price (R5 / G-P1-4). poId records the spend the award raised.
        payload: { title: rfq.title, quoteId: winner.id, supplier: winner.supplierName, amount: winner.amount, poId: po?.id ?? null },
      }),
    ]);
    this.logger.log(`RFQ ${rfq.title} (${rfq.id}) awarded to ${winner.supplierName} @ ${winner.amount}${po ? ` → PO ${po.id}` : ''}`);
    return { rfq: updated, quotes: await this.store.listQuotes(rfqId), po };
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Rfq | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  async getWithQuotes(id: Id): Promise<{ rfq: Rfq; quotes: RfqQuote[]; recommended: RfqQuote | null } | null> {
    const rfq = await this.store.get(id);
    if (!rfq) return null;
    const quotes = await this.store.listQuotes(id);
    return { rfq, quotes, recommended: lowestQuote(quotes) };
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
    today = new Date().toISOString().slice(0, 10),
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
