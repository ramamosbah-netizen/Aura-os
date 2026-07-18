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
  isPricingLocked,
  makeQuotation,
  reviseQuotation,
  buildQuotationLine,
  computeQuotationTotals,
} from './domain/quotation';
import { type QuotationPricingView, computeQuotationPricing, normalizePricingInput, deriveSellUnitPrice } from './domain/quotation-pricing';
import { CRM_QUOTATION_STORE, type QuotationFilter, type QuotationStore } from './quotation-store';
import { CRM_COMMERCIAL_BASELINE_STORE, type CommercialBaselineStore } from './commercial-baseline-store';
import { type CommercialBaseline, makeCommercialBaseline, COMMERCIAL_BASELINE_EVENT } from './domain/commercial-baseline';

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
    @Inject(CRM_COMMERCIAL_BASELINE_STORE) private readonly baselines: CommercialBaselineStore,
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

  async changeStatus(id: Id, action: QuotationAction, actorId: Id | null = null): Promise<Quotation> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    const updated = applyQuotationAction(q, action);
    await this.store.save(updated);
    const eventType =
      action === 'send' ? QUOTATION_EVENT.sent : action === 'accept' ? QUOTATION_EVENT.accepted : QUOTATION_EVENT.statusChanged;
    await this.events.append([
      makeEvent({
        type: eventType,
        tenantId: q.tenantId, companyId: q.companyId, actorId,
        aggregateType: 'crm.quotation', aggregateId: id,
        payload: { quoteNumber: q.quoteNumber, total: q.total, status: updated.status, action },
      }),
    ]);
    this.logger.log(`Quotation ${q.quoteNumber} (rev ${q.revision}) ${action} → ${updated.status}`);

    // Governance (R3): approval locks the immutable Commercial Baseline — the approved-price snapshot
    // the Contract will reference. Idempotent: only the first approval of this quotation locks one.
    if (action === 'approve') {
      const existing = await this.baselines.getByQuotation(updated.tenantId, updated.id);
      if (!existing) {
        const baseline = makeCommercialBaseline(updated, actorId);
        await this.baselines.save(baseline);
        await this.events.append([
          makeEvent({
            type: COMMERCIAL_BASELINE_EVENT.locked,
            tenantId: updated.tenantId, companyId: updated.companyId, actorId,
            aggregateType: 'crm.commercial_baseline', aggregateId: baseline.id,
            payload: { quotationId: updated.id, quoteNumber: updated.quoteNumber, total: baseline.total },
          }),
        ]);
        this.logger.log(`Commercial baseline locked for ${updated.quoteNumber}: total ${baseline.total} (${baseline.id})`);
      }
    }
    return updated;
  }

  /** The locked approved-price baseline for a quotation (null until it has been approved). */
  getBaseline(tenantId: Id, quotationId: Id): Promise<CommercialBaseline | null> {
    return this.baselines.getByQuotation(tenantId, quotationId);
  }

  /** Every locked baseline for a tenant — one read for the source-to-margin funnel (C5), which
   * traces contracts back to their deals through the baseline they were priced from. */
  listBaselines(tenantId: Id, limit = 5000): Promise<CommercialBaseline[]> {
    return this.baselines.list(tenantId, limit);
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

  /** The internal rate build-up for this revision, plus whether it's frozen. */
  async getPricing(id: Id): Promise<QuotationPricingView> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    return {
      ...computeQuotationPricing(q.lines, q.pricing),
      locked: isPricingLocked(q),
      status: q.status,
      quoteNumber: q.quoteNumber,
      revision: q.revision,
    };
  }

  /**
   * Persist the per-line cost build-up for this revision; returns the recomputed
   * sheet. Accepts the legacy lean shape (`{ unitCosts }`) — normalize lifts it.
   *
   * Governance: refused once the quotation is approved — the build-up that
   * justified the approved price is immutable. Re-price by raising a revision.
   */
  async setPricing(id: Id, input: unknown): Promise<QuotationPricingView> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    if (isPricingLocked(q)) {
      throw new Error(
        `pricing sheet is locked: only a draft or in-review quotation can be re-priced — ` +
          `${q.quoteNumber} Rev ${q.revision} is ${q.status}. Raise a revision to re-price.`,
      );
    }
    const lines = normalizePricingInput(q.lines.length, input);
    await this.store.save({ ...q, pricing: { lines } });
    this.logger.log(`Pricing sheet saved for ${q.quoteNumber} Rev ${q.revision}`);
    return {
      ...computeQuotationPricing(q.lines, { lines }),
      locked: false,
      status: q.status,
      quoteNumber: q.quoteNumber,
      revision: q.revision,
    };
  }

  /**
   * AUTHORING direction — price the quote FROM its sheet. Persists the per-line cost
   * build-up, then derives each line's sell price from its all-in unit cost + the
   * per-line target margin and writes those prices back onto the quotation lines
   * (recomputing line/quote totals). This is how a quote is generated from its
   * pricing sheet rather than by typing sell prices directly.
   *
   * Governance: refused once approved (same lock as setPricing) — the sheet behind
   * an approved price is immutable; re-price by raising a revision.
   */
  async applyPricing(id: Id, input: { lines?: unknown; targetMargins?: unknown }): Promise<QuotationPricingView> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    if (isPricingLocked(q)) {
      throw new Error(
        `pricing sheet is locked: only a draft or in-review quotation can be re-priced — ` +
          `${q.quoteNumber} Rev ${q.revision} is ${q.status}. Raise a revision to re-price.`,
      );
    }
    const buildups = normalizePricingInput(q.lines.length, input);
    // Cost side is independent of price — compute all-in unit cost per line from the build-up.
    const costed = computeQuotationPricing(q.lines, { lines: buildups });
    const margins = Array.isArray(input?.targetMargins) ? (input.targetMargins as unknown[]) : [];
    const lines = q.lines.map((l, i) => {
      const targetMargin = Number(margins[i]) || 0;
      const unitPrice = deriveSellUnitPrice(costed.lines[i]?.unitCostTotal ?? 0, targetMargin);
      return buildQuotationLine({ description: l.description, quantity: l.quantity, unitPrice, vatRate: l.vatRate });
    });
    const { subtotal, vatTotal, total } = computeQuotationTotals(lines);
    await this.store.save({ ...q, lines, subtotal, vatTotal, total, pricing: { lines: buildups } });
    this.logger.log(`Pricing applied to ${q.quoteNumber} Rev ${q.revision}: total ${total}`);
    return {
      ...computeQuotationPricing(lines, { lines: buildups }),
      locked: false,
      status: q.status,
      quoteNumber: q.quoteNumber,
      revision: q.revision,
    };
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
