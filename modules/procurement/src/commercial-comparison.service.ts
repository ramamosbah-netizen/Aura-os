import { Inject, Injectable, Logger } from '@nestjs/common';
import { ExchangeRateService } from '@aura/core';
import type { Id } from '@aura/shared';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import { QUOTATION_LINE_STORE, type QuotationLineStore } from './quotation-line.store';
import { RFQ_STORE, type RfqStore } from './rfq-store';
import type { RfqQuote } from './domain/rfq';
import {
  normaliseRequirementLine,
  quotationCommercialComponents,
  type ComparisonContext,
  type NormalisedRequirementLine,
  type QuotationCommercialComponents,
  type ResolvedFx,
} from './domain/commercial-normalisation';

/**
 * SUP-06 — every supplier's answer to ONE requisition line, expressed comparably.
 *
 * The grain is the requisition line because that is the question a buyer actually asks: "what did
 * everyone offer for THIS item", not "what did this supplier say". That was frozen before any of
 * this was built, and it is why the read below starts from a `prLineId`.
 *
 * This service PRODUCES FACTS AND RANKS NOTHING. There is deliberately no cheapest, no winner, no
 * recommendation and no ordering by price: what a decision does with these facts is SUP-13's
 * authority, and putting a `sort()` here would quietly make this the decision-maker.
 *
 * It resolves FX through the Finance authority in the kernel — the same one that governs invoice
 * booking — so a comparison and a booked invoice cannot disagree about what a rate was. The domain
 * itself stays pure: the rate is resolved here and passed IN as a fact.
 */
@Injectable()
export class CommercialComparisonService {
  private readonly logger = new Logger('CommercialComparison');

  constructor(
    @Inject(PR_LINE_STORE) private readonly prLines: PurchaseRequestLineStore,
    @Inject(QUOTATION_LINE_STORE) private readonly quotationLines: QuotationLineStore,
    @Inject(RFQ_STORE) private readonly rfqs: RfqStore,
    private readonly fx: ExchangeRateService,
  ) {}

  /**
   * Resolve one currency for the comparison, once.
   *
   * Cached per call so a comparison with six offers in EUR asks the FX authority once rather than
   * six times — and, more importantly, so every EUR line in a single comparison is valued at the
   * SAME rate. Two lines converted at different rates within one comparison would be a defect that
   * is nearly invisible.
   */
  private async resolveFx(
    tenantId: Id,
    currency: string | null,
    context: ComparisonContext,
    cache: Map<string, ResolvedFx>,
  ): Promise<ResolvedFx> {
    if (!currency) return { status: 'unknown', reason: 'currency_unknown' };
    const key = currency.trim().toUpperCase();
    const cached = cache.get(key);
    if (cached) return cached;

    const resolved = await this.fx.resolveGovernedRate(
      tenantId, key, context.baseCurrency, new Date(context.comparisonDate),
    );
    const fact: ResolvedFx = resolved.status === 'governed'
      ? { status: 'governed', rate: resolved.rate, source: resolved.source, effectiveDate: resolved.effectiveDate, rateId: resolved.rateId }
      : { status: 'unknown', reason: resolved.reason };
    cache.set(key, fact);
    return fact;
  }

  /**
   * The comparison for one requirement.
   *
   * `context` is required in full. The caller states the base currency and the comparison date; this
   * service does not invent either, and every value it returns carries the date it was computed
   * under so the same read tomorrow is recognisably the same read.
   */
  async compareRequirement(
    tenantId: Id,
    prLineId: Id,
    context: ComparisonContext,
  ): Promise<{
    prLineId: Id;
    requestedQuantity: number | null;
    requestedUom: string | null;
    materialCode: string | null;
    materialName: string | null;
    context: ComparisonContext;
    offers: NormalisedRequirementLine[];
    quotations: QuotationCommercialComponents[];
  }> {
    const requirement = await this.prLines.find(prLineId, tenantId);
    if (!requirement) throw new Error(`requisition line ${prLineId} not found`);

    const lines = await this.quotationLines.listByRequirement(tenantId, prLineId);
    const fxCache = new Map<string, ResolvedFx>();

    // One quotation may answer several requirements; fetch each once.
    const quotes = new Map<string, RfqQuote>();
    for (const line of lines) {
      if (quotes.has(line.quotationId)) continue;
      const quote = await this.rfqs.getQuote(line.quotationId);
      if (quote && quote.tenantId === tenantId) quotes.set(line.quotationId, quote);
    }

    const offers: NormalisedRequirementLine[] = [];
    for (const line of lines) {
      const quote = quotes.get(line.quotationId);
      if (!quote) continue;
      offers.push(normaliseRequirementLine({
        line,
        quote,
        requestedQuantity: requirement.quantity ?? null,
        requestedUom: requirement.uom ?? null,
        fx: await this.resolveFx(tenantId, quote.currency, context, fxCache),
        context,
      }));
    }

    const quotations: QuotationCommercialComponents[] = [];
    for (const quote of quotes.values()) {
      quotations.push(quotationCommercialComponents(
        quote, await this.resolveFx(tenantId, quote.currency, context, fxCache), context,
      ));
    }

    const comparable = offers.filter((o) => o.normalisedUnitPrice.status === 'comparable').length;
    this.logger.log(
      `Requirement ${prLineId}: ${offers.length} offer(s), ${comparable} comparable on ${context.comparisonDate}`,
    );

    return {
      prLineId,
      requestedQuantity: requirement.quantity ?? null,
      requestedUom: requirement.uom ?? null,
      materialCode: requirement.materialCode ?? null,
      materialName: requirement.materialName ?? null,
      context,
      // Returned in the order the offers were recorded. NOT sorted by price: an ordering IS a
      // recommendation, and this service does not make one.
      offers,
      quotations,
    };
  }
}
