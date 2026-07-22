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
  normaliseExclusions,
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

  /**
   * Edit the commercial terms (free-form notes, exclusions, payment and delivery conditions) on
   * a quotation still being worked up. Only draft / internal-review — the same commitment
   * boundary as the pricing sheet: once approved or sent, the customer and the locked baseline
   * hold these terms, so changing them means raising a revision, not a quiet in-place edit.
   *
   * The guard is phrased "only … can" on purpose: the error taxonomy maps that to 409, whereas
   * "cannot …" would map to 400 — a locked quote is a state conflict, not bad input.
   */
  async updateCommercialTerms(
    id: Id,
    input: { terms?: string | null; exclusions?: string[]; paymentConditions?: string | null; deliveryTerms?: string | null },
  ): Promise<Quotation> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    if (isPricingLocked(q)) {
      throw new Error(`only a draft or in-review quotation can have its commercial terms edited — raise a revision to change them after that`);
    }
    const updated: Quotation = {
      ...q,
      terms: input.terms !== undefined ? (input.terms?.trim() || null) : q.terms,
      exclusions: input.exclusions !== undefined ? normaliseExclusions(input.exclusions) : q.exclusions,
      paymentConditions: input.paymentConditions !== undefined ? (input.paymentConditions?.trim() || null) : q.paymentConditions,
      deliveryTerms: input.deliveryTerms !== undefined ? (input.deliveryTerms?.trim() || null) : q.deliveryTerms,
    };
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: QUOTATION_EVENT.updated,
        tenantId: q.tenantId, companyId: q.companyId, actorId: q.createdBy,
        aggregateType: 'crm.quotation', aggregateId: id,
        payload: { quoteNumber: q.quoteNumber, field: 'commercial_terms' },
      }),
    ]);
    return updated;
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

  /**
   * All revisions of a quotation, oldest revision first.
   *
   * The quote number alone is NOT the chain. Numbers derived from a source record collide —
   * quoting the same opportunity twice produces two independent quotes sharing one number, both
   * at revision 0 — and returning those as a revision history invents a price change between
   * two unrelated quotes. `parentQuotationId` is the authoritative link, so the chain is the
   * connected component under it.
   *
   * The number-matched set is still used as a fallback, but only when its revision numbers are
   * distinct: that shape is a real chain whose links were never written, whereas a repeated
   * revision number proves the rows are separate quotes.
   */
  async listRevisions(tenantId: string, id: Id): Promise<Quotation[]> {
    const q = await this.store.get(id);
    if (!q) return [];
    const candidates = await this.store.list({ tenantId, quoteNumber: q.quoteNumber, limit: 100 });
    const byId = new Map(candidates.map((c) => [c.id, c]));

    // Up to the root, then down through the children — the component containing `q`.
    let root = q;
    const guard = new Set<Id>([q.id]);
    while (root.parentQuotationId) {
      const parent = byId.get(root.parentQuotationId);
      if (!parent || guard.has(parent.id)) break; // missing link, or a cycle in bad data
      guard.add(parent.id);
      root = parent;
    }
    const chain = [root];
    for (;;) {
      const child = candidates.find((c) => c.parentQuotationId === chain[chain.length - 1].id && !guard.has(c.id));
      if (!child) break;
      guard.add(child.id);
      chain.push(child);
    }

    if (chain.length > 1) return chain.sort((a, b) => a.revision - b.revision);

    // Unlinked. Trust the number only when it cannot be hiding two separate quotes.
    const revisions = candidates.map((c) => c.revision);
    const distinct = new Set(revisions).size === revisions.length;
    return distinct ? [...candidates].sort((a, b) => a.revision - b.revision) : [q];
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

  /**
   * Author the quote's LINES from the pricing sheet — the sheet is the source of items, not a
   * cost layer over lines someone already typed. Each item carries its own description, quantity,
   * cost build-up and target margin; the line is generated with a sell price derived from cost and
   * margin. This is what "the items are imported from the sheet, with selling prices" means.
   *
   * The item identity is stored back onto the sheet (description/quantity/targetMarginPercent
   * alongside the build-up), so reopening the sheet shows the same items and margins rather than
   * bare cost columns. Refused (409) once approved — same lock as applyPricing.
   */
  async generateFromSheet(id: Id, items: unknown): Promise<Quotation> {
    const q = await this.store.get(id);
    if (!q) throw new Error(`quotation ${id} not found`);
    if (isPricingLocked(q)) {
      throw new Error(
        `pricing sheet is locked: only a draft or in-review quotation can be re-priced — ` +
          `${q.quoteNumber} Rev ${q.revision} is ${q.status}. Raise a revision to re-price.`,
      );
    }
    const rows = Array.isArray(items) ? items : [];
    if (rows.length === 0) throw new Error('the pricing sheet needs at least one item to generate lines');

    const buildups = normalizePricingInput(rows.length, { lines: rows });
    // Temp lines carry each item's description + quantity so the sheet engine computes unit cost
    // against the right quantity; an item with no description gets a stable fallback name.
    const temp = rows.map((r, i) => {
      const it = (r ?? {}) as { description?: string; quantity?: number };
      return buildQuotationLine({
        description: (it.description ?? '').trim() || `Item ${i + 1}`,
        quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
        unitPrice: 0,
        vatRate: 5,
      });
    });
    const costed = computeQuotationPricing(temp, { lines: buildups });
    const lines = temp.map((t, i) => {
      const margin = Number((rows[i] as { targetMarginPercent?: number })?.targetMarginPercent) || 0;
      const unitPrice = deriveSellUnitPrice(costed.lines[i]?.unitCostTotal ?? 0, margin);
      return buildQuotationLine({ description: t.description, quantity: t.quantity, unitPrice, vatRate: t.vatRate });
    });
    const { subtotal, vatTotal, total } = computeQuotationTotals(lines);
    // Persist item identity WITH the build-up, so the sheet reopens as items + margins, not columns.
    const pricingLines = buildups.map((b, i) => ({
      ...b,
      description: temp[i].description,
      quantity: temp[i].quantity,
      targetMarginPercent: Number((rows[i] as { targetMarginPercent?: number })?.targetMarginPercent) || 0,
    }));
    const updated: Quotation = { ...q, lines, subtotal, vatTotal, total, pricing: { lines: pricingLines } };
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: QUOTATION_EVENT.updated,
        tenantId: q.tenantId, companyId: q.companyId, actorId: q.createdBy,
        aggregateType: 'crm.quotation', aggregateId: id,
        payload: { quoteNumber: q.quoteNumber, field: 'lines_from_sheet', lineCount: lines.length, total },
      }),
    ]);
    this.logger.log(`Generated ${lines.length} line(s) from the pricing sheet for ${q.quoteNumber}: total ${total}`);
    return updated;
  }

  /**
   * What we have quoted this item for before — the historic half of the pricing library. Aggregates
   * the line items of past quotes into distinct descriptions with how many times and at what price,
   * so an estimator sees "you quoted this 6 times, most recently at 780" instead of guessing afresh.
   *
   * Uses the SELL unit price actually put on the line, not a cost. It is history, so it is honest
   * about spread: min/max as well as the most recent.
   */
  async priceHistory(
    tenantId: string,
    q?: string,
  ): Promise<Array<{ description: string; count: number; lastPrice: number; minPrice: number; maxPrice: number; lastAt: string }>> {
    const quotes = await this.store.list({ tenantId, limit: 500 });
    const needle = q?.trim().toLowerCase();
    const map = new Map<string, { name: string; prices: number[]; last: { price: number; at: string } }>();
    for (const quote of quotes) {
      for (const l of quote.lines) {
        const desc = l.description?.trim();
        if (!desc || l.unitPrice <= 0) continue;
        if (needle && !desc.toLowerCase().includes(needle)) continue;
        const key = desc.toLowerCase();
        const e = map.get(key) ?? { name: desc, prices: [], last: { price: 0, at: '' } };
        e.prices.push(l.unitPrice);
        // Latest by the quote's createdAt — the price the market last bore.
        if (quote.createdAt > e.last.at) e.last = { price: l.unitPrice, at: quote.createdAt };
        map.set(key, e);
      }
    }
    return [...map.values()]
      .map((e) => ({
        description: e.name,
        count: e.prices.length,
        lastPrice: e.last.price,
        minPrice: Math.min(...e.prices),
        maxPrice: Math.max(...e.prices),
        lastAt: e.last.at,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
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
