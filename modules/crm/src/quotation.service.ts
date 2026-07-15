import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  QUOTATION_EVENT,
  QUOTATION_ACTIONS,
  type Quotation,
  type NewQuotation,
  type QuotationAction,
  applyQuotationAction,
  makeQuotation,
  reviseQuotation,
} from './domain/quotation';
import { type QuotationPricingSheet, computeQuotationPricing, normalizeUnitCosts } from './domain/quotation-pricing';
import { CRM_QUOTATION_STORE, type QuotationFilter, type QuotationStore } from './quotation-store';

export { QUOTATION_ACTIONS, type QuotationAction };

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
    const updated = applyQuotationAction(q, action);
    await this.store.save(updated);
    const eventType =
      action === 'send' ? QUOTATION_EVENT.sent : action === 'accept' ? QUOTATION_EVENT.accepted : QUOTATION_EVENT.statusChanged;
    await this.events.append([
      makeEvent({
        type: eventType,
        tenantId: q.tenantId, companyId: q.companyId, actorId: null,
        aggregateType: 'crm.quotation', aggregateId: id,
        payload: { quoteNumber: q.quoteNumber, total: q.total, status: updated.status, action },
      }),
    ]);
    this.logger.log(`Quotation ${q.quoteNumber} (rev ${q.revision}) ${action} → ${updated.status}`);
    return updated;
  }

  /** Supersede + copy: the old record becomes 'revised', a new draft carries revision+1. */
  async revise(id: Id): Promise<Quotation> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    const { superseded, next } = reviseQuotation(q);
    await this.store.save(superseded);
    await this.store.save(next);
    await this.events.append([
      makeEvent({
        type: QUOTATION_EVENT.revised,
        tenantId: q.tenantId, companyId: q.companyId, actorId: null,
        aggregateType: 'crm.quotation', aggregateId: next.id,
        payload: { quoteNumber: q.quoteNumber, fromRevision: q.revision, toRevision: next.revision, supersededId: q.id },
      }),
    ]);
    this.logger.log(`Quotation ${q.quoteNumber} revised: Rev ${q.revision} → Rev ${next.revision}`);
    return next;
  }

  /** Record the contract created from an accepted quotation (deal-chain link). */
  async linkContract(id: Id, contractId: Id): Promise<void> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    await this.store.save({ ...q, convertedContractId: contractId });
  }

  get(id: Id): Promise<Quotation | null> {
    return this.store.get(id);
  }

  /** All revisions of a quotation (same quote number), oldest revision first. */
  async listRevisions(tenantId: string, id: Id): Promise<Quotation[]> {
    const q = await this.store.get(id);
    if (!q) return [];
    const all = await this.store.list({ tenantId, quoteNumber: q.quoteNumber, limit: 100 });
    return all.sort((a, b) => a.revision - b.revision);
  }

  /** The internal cost & margin sheet for this revision (zero-cost default until priced). */
  async getPricing(id: Id): Promise<QuotationPricingSheet> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    return computeQuotationPricing(q.lines, q.pricing?.unitCosts ?? []);
  }

  /** Persist per-line unit costs for this revision; returns the recomputed sheet. */
  async setPricing(id: Id, unitCosts: number[]): Promise<QuotationPricingSheet> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    const costs = normalizeUnitCosts(q.lines.length, unitCosts);
    await this.store.save({ ...q, pricing: { unitCosts: costs } });
    return computeQuotationPricing(q.lines, costs);
  }

  /** Quotations generated from a tender's pricing sheet. */
  listBySourceTender(tenantId: string, tenderId: string): Promise<Quotation[]> {
    return this.store.list({ tenantId, sourceTenderId: tenderId });
  }

  list(filter?: QuotationFilter): Promise<Quotation[]> {
    return this.store.list(filter);
  }

  listPaged(filter: QuotationFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
