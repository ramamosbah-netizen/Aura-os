import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner, NullTxRunner } from '@aura/core';
import { type Id, makeEvent } from '@aura/shared';
import {
  type Quotation, makeQuotation, QUOTATION_EVENT,
} from './domain/quotation';
import { type PricingSheet, quotationLinesFromSheet, linkQuotation } from './domain/pricing-sheet';
import { CRM_QUOTATION_STORE, type QuotationStore } from './quotation-store';
import { CRM_PRICING_SHEET_STORE, type PricingSheetStore } from './pricing-sheet-store';
import { PreAwardPackageService } from './pre-award-package.service';

/**
 * Slice 8 PR-2 — MATERIALISE the quotation from the current frozen pricing revision.
 *
 * The negotiation loop this fixes: re-pricing must produce a quotation REVISION, not an independent
 * quote, and re-generating from the same pricing revision must return the SAME quotation — never a
 * duplicate, never an orphan. The identity anchor is the PRICING REVISION, not the numbers:
 *
 *   - Generate from P-001            → Q-001 (rev 0).
 *   - Generate from P-001 again      → the same Q-001 (P-001.quotationId already set).
 *   - Freeze P-002, Generate         → Q-002 (parentQuotationId = Q-001), Q-001 → 'revised',
 *                                       P-002.quotationId = Q-002.
 *   - Generate from P-002 again      → the same Q-002.
 *   - P-003 with identical numbers   → Q-003 (parentQuotationId = Q-002). NO content de-dup — a new
 *                                       pricing revision is a new commercial revision by identity.
 *
 * Every write — the superseded prior quote, the new revision, its events, and the pricing→quote link —
 * commits on ONE Postgres client (the TxRunner's), so a forced failure rolls ALL of it back: no new
 * quote, no partial supersession, no half-written link. Money comes only from the frozen sheet.
 */
@Injectable()
export class PricingQuotationService {
  private readonly logger = new Logger('CRM-PricingQuotation');

  constructor(
    @Inject(CRM_PRICING_SHEET_STORE) private readonly pricing: PricingSheetStore,
    @Inject(CRM_QUOTATION_STORE) private readonly quotations: QuotationStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly packages: PreAwardPackageService,
    @Optional() @Inject(TX_RUNNER) private readonly tx: TxRunner = new NullTxRunner(),
  ) {}

  /**
   * Produce (or return) the quotation for a direct deal's CURRENT frozen pricing. Idempotent by
   * pricing-revision identity; atomic; money sourced only from the sheet.
   */
  async materialise(input: {
    tenantId: Id; opportunityId: Id; customerName: string; accountId?: Id | null; actorId?: Id | null;
  }): Promise<Quotation> {
    const sheet = await this.packages.frozenPricingFor(input.tenantId, input.opportunityId);
    if (!sheet) {
      throw new Error('only a deal with current frozen pricing can be quoted — freeze the pricing first');
    }

    // (1) Identity idempotency: this exact pricing revision already produced its quote → return it.
    if (sheet.quotationId) {
      const existing = await this.quotations.get(sheet.quotationId);
      if (existing) return existing;
    }

    // (2) The quote the PARENT pricing revision produced, and the offer's LIVE revision descending
    //     from it. They differ when the offer was revised after that pricing — a customer revision
    //     raised in CRM, say — and the approved change must supersede what is live now.
    //
    //     EST-19, measured before this: a governed offer sent at the approved 24 and copy-revised in
    //     CRM (Rev 1, still 24), then an APPROVED scope change to 30, costed, priced and frozen — and
    //     converting it returned the copy, still at 24, linked to the 30 sheet. The approved change
    //     never reached the offer, and the sheet and the offer disagreed about what was sold.
    const prior = await this.priorQuote(input.tenantId, sheet);
    let base = prior;
    if (prior) {
      const tip = await this.liveTipOf(input.tenantId, prior);
      if (tip && tip.id !== prior.id) {
        // (3) Convergence for the non-atomic (in-memory) path: a prior attempt minted THIS sheet's
        //     revision but did not link it — adopt it rather than duplicate. Only a revision this
        //     sheet produced is adopted; any other live revision is superseded below.
        if (JSON.stringify(tip.estimation ?? null) === JSON.stringify(sheet.lines)) {
          if (sheet.quotationId !== tip.id) {
            await this.tx.run((tx) => this.pricing.saveWithClient(tx, linkQuotation(sheet, tip.id)));
          }
          return tip;
        }
        base = tip;
      }
    }
    if (base && base.status === 'accepted') {
      throw new Error(
        `cannot re-price ${base.quoteNumber}: the customer has already accepted it — an accepted quotation is an awarded deal, not a draft to revise`,
      );
    }
    if (base && base.status === 'internal_review') {
      throw new Error(
        `${base.quoteNumber} Rev ${base.revision} is with a commercial reviewer, and a re-priced scope can only supersede it once the reviewer has returned or decided it`,
      );
    }

    // (4) Money provenance: the quote's lines + totals come ONLY from this frozen sheet.
    const lineDrafts = quotationLinesFromSheet(sheet);
    const today = new Date().toISOString().slice(0, 10);

    const quote = base
      ? makeQuotation({
          tenantId: input.tenantId, companyId: sheet.companyId,
          quoteNumber: base.quoteNumber, customerName: base.customerName, accountId: base.accountId,
          subject: base.subject, contactName: base.contactName, sourceOpportunityId: base.sourceOpportunityId,
          ownerId: base.ownerId, terms: base.terms, exclusions: base.exclusions,
          paymentConditions: base.paymentConditions, deliveryTerms: base.deliveryTerms,
          revision: base.revision + 1, parentQuotationId: base.id,
          issueDate: today, validUntil: base.validUntil,
          lines: lineDrafts, estimation: sheet.lines, createdBy: input.actorId ?? null,
        })
      : makeQuotation({
          tenantId: input.tenantId, companyId: sheet.companyId,
          quoteNumber: `QT-OPP-${input.opportunityId.slice(0, 8)}`, customerName: input.customerName,
          accountId: input.accountId ?? null, sourceOpportunityId: input.opportunityId,
          issueDate: today, lines: lineDrafts, estimation: sheet.lines, createdBy: input.actorId ?? null,
        });

    await this.tx.run(async (tx) => {
      if (base) {
        await this.quotations.saveWithClient(tx, { ...base, status: 'revised' });
        await this.events.appendWithClient(tx, [makeEvent({
          type: QUOTATION_EVENT.revised, tenantId: input.tenantId, companyId: sheet.companyId, actorId: input.actorId ?? null,
          aggregateType: 'crm.quotation', aggregateId: quote.id,
          payload: { quoteNumber: quote.quoteNumber, fromRevision: base.revision, toRevision: quote.revision, supersededId: base.id, pricingSheetId: sheet.id },
        })]);
      }
      await this.quotations.saveWithClient(tx, quote);
      await this.events.appendWithClient(tx, [makeEvent({
        type: QUOTATION_EVENT.created, tenantId: input.tenantId, companyId: sheet.companyId, actorId: input.actorId ?? null,
        aggregateType: 'crm.quotation', aggregateId: quote.id,
        payload: { quoteNumber: quote.quoteNumber, revision: quote.revision, total: quote.total, pricingSheetId: sheet.id, sourceOpportunityId: input.opportunityId },
      })]);
      // The pricing→quote link closes in the SAME transaction — no window for an orphan quote.
      await this.pricing.saveWithClient(tx, linkQuotation(sheet, quote.id));
    });

    this.logger.log(
      `Quotation ${quote.quoteNumber} Rev ${quote.revision} materialised from pricing ${sheet.id} (P-${String(sheet.version).padStart(3, '0')}, total ${quote.total})` +
        (base ? ` — superseded ${base.quoteNumber} Rev ${base.revision}` : ''),
    );
    return quote;
  }

  /** The quote produced by the sheet's PARENT pricing revision, if any. */
  private async priorQuote(tenantId: Id, sheet: PricingSheet): Promise<Quotation | null> {
    if (!sheet.parentSheetId) return null;
    const parent = await this.pricing.get(sheet.parentSheetId);
    if (!parent?.quotationId) return null;
    return this.quotations.get(parent.quotationId);
  }

  /**
   * The offer's LIVE revision descending from `prior`: follow the revision links down while each
   * revision has exactly one child. `prior` itself when nothing has superseded it.
   */
  private async liveTipOf(tenantId: Id, prior: Quotation): Promise<Quotation | null> {
    const chain = await this.quotations.list({ tenantId, quoteNumber: prior.quoteNumber, limit: 100 });
    let tip = prior;
    for (let guard = 0; guard < chain.length; guard++) {
      const children = chain.filter((q) => q.parentQuotationId === tip.id);
      if (children.length !== 1) break;
      tip = children[0];
    }
    return tip.status === 'revised' ? null : tip;
  }
}
