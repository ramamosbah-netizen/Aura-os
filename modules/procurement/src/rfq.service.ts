import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
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
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`RFQ ${id} not found`);
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

  /** Award the RFQ to a quote: the winner is marked awarded, the rest rejected, the RFQ closed-out. */
  async award(rfqId: Id, quoteId: Id, actorId?: Id): Promise<{ rfq: Rfq; quotes: RfqQuote[] }> {
    const rfq = await this.store.get(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    const quotes = await this.store.listQuotes(rfqId);
    const winner = quotes.find((q) => q.id === quoteId);
    if (!winner) throw new Error(`quote ${quoteId} not found on RFQ ${rfqId}`);

    for (const q of quotes) {
      const status = q.id === quoteId ? 'awarded' : 'rejected';
      if (q.status !== status) await this.store.updateQuote({ ...q, status });
    }
    const updated: Rfq = { ...rfq, status: 'awarded' };
    await this.store.update(updated);

    await this.events.append([
      makeEvent({
        type: RFQ_EVENT.rfqAwarded,
        tenantId: rfq.tenantId,
        companyId: rfq.companyId,
        actorId: actorId ?? null,
        aggregateType: 'procurement.rfq',
        aggregateId: rfq.id,
        payload: { title: rfq.title, supplier: winner.supplierName, amount: winner.amount },
      }),
    ]);
    this.logger.log(`RFQ ${rfq.title} (${rfq.id}) awarded to ${winner.supplierName} @ ${winner.amount}`);
    return { rfq: updated, quotes: await this.store.listQuotes(rfqId) };
  }

  get(id: Id): Promise<Rfq | null> {
    return this.store.get(id);
  }

  async getWithQuotes(id: Id): Promise<{ rfq: Rfq; quotes: RfqQuote[]; recommended: RfqQuote | null } | null> {
    const rfq = await this.store.get(id);
    if (!rfq) return null;
    const quotes = await this.store.listQuotes(id);
    return { rfq, quotes, recommended: lowestQuote(quotes) };
  }

  list(filter?: RfqFilter): Promise<Rfq[]> {
    return this.store.list(filter);
  }
}
