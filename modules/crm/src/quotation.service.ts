import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  QUOTATION_EVENT,
  type Quotation,
  type NewQuotation,
  makeQuotation,
  sendQuotation,
  acceptQuotation,
  rejectQuotation,
  expireQuotation,
} from './domain/quotation';
import { CRM_QUOTATION_STORE, type QuotationFilter, type QuotationStore } from './quotation-store';

type QuotationAction = 'send' | 'accept' | 'reject' | 'expire';

const ACTIONS: Record<QuotationAction, (q: Quotation) => Quotation> = {
  send: sendQuotation,
  accept: acceptQuotation,
  reject: rejectQuotation,
  expire: expireQuotation,
};

/**
 * Quotation service — owns `aura_crm_quotations`, emits `crm.quotation.*` on the spine.
 * The pre-sales quote that precedes a Contract / Customer Invoice.
 */
@Injectable()
export class QuotationService {
  private readonly logger = new Logger('CrmQuotation');

  constructor(
    @Inject(CRM_QUOTATION_STORE) private readonly store: QuotationStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewQuotation): Promise<Quotation> {
    const q = makeQuotation(input);
    await this.store.save(q);
    await this.events.append([
      makeEvent({
        type: QUOTATION_EVENT.created,
        tenantId: q.tenantId,
        companyId: q.companyId,
        actorId: q.createdBy,
        aggregateType: 'crm.quotation',
        aggregateId: q.id,
        payload: { quoteNumber: q.quoteNumber, customerName: q.customerName, total: q.total },
      }),
    ]);
    this.logger.log(`Quotation ${q.quoteNumber} created for ${q.customerName}: total ${q.total}`);
    return q;
  }

  async changeStatus(id: Id, action: QuotationAction): Promise<Quotation> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    const fn = ACTIONS[action];
    if (!fn) throw new Error(`unknown action ${action}`);
    const updated = fn(q);
    await this.store.save(updated);
    const eventType = action === 'send' ? QUOTATION_EVENT.sent : action === 'accept' ? QUOTATION_EVENT.accepted : null;
    if (eventType) {
      await this.events.append([
        makeEvent({
          type: eventType,
          tenantId: q.tenantId, companyId: q.companyId, actorId: null,
          aggregateType: 'crm.quotation', aggregateId: id,
          payload: { quoteNumber: q.quoteNumber, total: q.total, status: updated.status },
        }),
      ]);
    }
    return updated;
  }

  get(id: Id): Promise<Quotation | null> {
    return this.store.get(id);
  }

  list(filter?: QuotationFilter): Promise<Quotation[]> {
    return this.store.list(filter);
  }

  listPaged(filter: QuotationFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
