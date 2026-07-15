import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, NotFoundException, Param, Post } from '@nestjs/common';
import { NumberingService, ParseUuidOr404Pipe, SettingsService, TenantContext } from '@aura/core';
import { toCsv } from '@aura/shared';
import {
  EstimateService,
  EstimateSourcingService,
  PRICING_SHEET_CSV_COLUMNS,
  PRICING_SUMMARY_CSV_COLUMNS,
  TenderService,
  isSourceStale,
  pricingSheetCsvRows,
  type BOQItem,
  type EstimateSource,
  type RateBuildUp,
  type ResourceBreakdown,
  type TenderEstimate,
  type Tender,
} from '@aura/tendering';
import { QuotationService, isQuotationCommitted, type NewQuotationLine, type Quotation } from '@aura/crm';
import { RfqService } from '@aura/procurement';

/** One pricing-sheet summary row (the hub + the summary CSV share it). */
interface SheetSummary {
  tenderId: string;
  tenderTitle: string;
  reference: string | null;
  client: string | null;
  status: string;
  boqItems: number;
  pricedItems: number;
  directCost: number;
  indirect: number;
  overhead: number;
  profit: number;
  sellingValue: number;
  unpricedBoqValue: number;
  tenderValue: number;
  marginPercent: number;
}

/**
 * Tender pricing sheet (the company's INTERNAL "Cost & Resource Breakdown") +
 * the bridge to the client-facing quotation. Flow: tender + BOQ scope → per-item
 * resource breakdown (material, technician/engineer/PM manpower, transport,
 * wastage, accessories, subcontract → overhead % → profit %) → selling rates →
 * one click generates the CRM quotation that goes to the client. The sheet stays
 * internal; the quotation carries only descriptions, quantities and unit prices.
 */
@Controller('tendering/tenders')
export class TenderPricingController {
  constructor(
    private readonly tenders: TenderService,
    private readonly estimates: EstimateService,
    private readonly estimateSourcing: EstimateSourcingService,
    private readonly rfqs: RfqService,
    private readonly quotations: QuotationService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly tenant: TenantContext,
  ) {}

  private async tenderOr404(id: string): Promise<Tender> {
    const tender = await this.tenders.get(id);
    if (!tender || tender.tenantId !== this.tenant.get().tenantId) throw new NotFoundException(`tender ${id} not found`);
    return tender;
  }

  /**
   * Governance — this estimate is the costing that justifies the quotation generated from it.
   * Once that quotation is a live commitment to the client (approved onwards, mirroring the
   * quotation sheet's own lock), the costing behind it is FROZEN: re-working it would rewrite
   * the justification for a price we are already standing behind. Re-price the sanctioned way —
   * raise a quotation revision, which starts as a draft.
   *
   * Dead quotes (rejected/expired/cancelled) and superseded ones (`revised`) hold no live
   * commitment, so the estimate stays open for the next bid.
   *
   * The rule lives here in the composition layer, not in @aura/tendering: tendering must not
   * depend on CRM (ADR-0011) — the same seam R5 uses to keep it decoupled from procurement.
   */
  private async assertEstimateNotCommitted(tenderId: string): Promise<void> {
    const generated = await this.quotations.listBySourceTender(this.tenant.get().tenantId, tenderId);
    const committed = generated.filter((q) => isQuotationCommitted(q));
    if (committed.length === 0) return;
    const which = committed.map((q) => `${q.quoteNumber} Rev ${q.revision} (${q.status.replace('_', ' ')})`).join(', ');
    // A revision is only legal from sent/under_negotiation (and the dead states) — never from
    // `accepted`, where the price is already the basis of a contract. Point each case at the route
    // that actually exists rather than at advice that would 400.
    const onlyAccepted = committed.every((q) => q.status === 'accepted');
    const route = onlyAccepted
      ? 'an accepted price is the basis of the contract — change it through a contract variation'
      : 'raise a quotation revision to re-price';
    throw new ConflictException(
      `tender pricing sheet is locked: ${which} ${committed.length === 1 ? 'was' : 'were'} generated from this ` +
        `estimate and ${committed.length === 1 ? 'is' : 'are'} committed to the client — the costing behind a ` +
        `committed price is immutable. To change it, ${route}.`,
    );
  }

  /** Default hourly rates for the sheet (admin-configurable module settings; CSV-era fallbacks). */
  private async hourlyRates(tenantId: string): Promise<{ technician: number; engineer: number; projectManager: number }> {
    const rate = async (key: string, fallback: number): Promise<number> => {
      const v = Number(await this.settings.get(tenantId, key));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    return {
      technician: await rate('tendering.rate.technician', 15),
      engineer: await rate('tendering.rate.engineer', 20),
      projectManager: await rate('tendering.rate.projectManager', 40),
    };
  }

  private async sheetSummaries(tenantId: string): Promise<SheetSummary[]> {
    const tenderIds = await this.estimates.tendersWithSheets(tenantId);
    const out: SheetSummary[] = [];
    for (const tid of tenderIds) {
      const [tender, estimate] = await Promise.all([this.tenders.get(tid), this.estimates.tenderEstimate(tenantId, tid)]);
      // Orphan sheets (all BOQ lines deleted since pricing) carry no information — skip.
      if (!tender || tender.tenantId !== tenantId || !estimate || estimate.itemCount === 0) continue;
      out.push({
        tenderId: tid,
        tenderTitle: tender.title,
        reference: tender.reference,
        client: tender.accountName,
        status: tender.status,
        boqItems: estimate.itemCount,
        pricedItems: estimate.estimatedItemCount,
        directCost: estimate.totalDirectCost,
        indirect: estimate.totalIndirect,
        overhead: estimate.totalOverhead,
        profit: estimate.totalProfit,
        sellingValue: estimate.totalSellingValue,
        unpricedBoqValue: estimate.unpricedBoqValue,
        tenderValue: estimate.estimatedTenderValue,
        marginPercent: estimate.marginPercent,
      });
    }
    return out;
  }

  /** Every pricing sheet in the tenant (tenders with at least one priced line) — the hub. */
  @Get('pricing/sheets')
  async sheets(): Promise<SheetSummary[]> {
    return this.sheetSummaries(this.tenant.get().tenantId);
  }

  /** All sheets as a summary CSV (one row per tender). */
  @Get('pricing/sheets.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pricing-sheets.csv"')
  async sheetsCsv(): Promise<string> {
    const rows = await this.sheetSummaries(this.tenant.get().tenantId);
    return toCsv(
      rows.map(({ tenderId: _tenderId, ...r }) => ({ ...r, reference: r.reference ?? '', client: r.client ?? '' })),
      [...PRICING_SUMMARY_CSV_COLUMNS],
    );
  }

  /** One tender's full breakdown as CSV — the original spreadsheet, exported. */
  @Get(':id/pricing/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pricing-sheet.csv"')
  async sheetCsv(@Param('id', ParseUuidOr404Pipe) id: string): Promise<string> {
    const ctx = this.tenant.get();
    await this.tenderOr404(id);
    const { items } = await this.tenders.getOrCreateBOQ(ctx.tenantId, ctx.companyId ?? null, id);
    const buildUps = await this.estimates.listByTender(ctx.tenantId, id);
    return toCsv(pricingSheetCsvRows(items, buildUps), [...PRICING_SHEET_CSV_COLUMNS]);
  }

  /** Everything the pricing sheet page needs in one fetch. */
  @Get(':id/pricing')
  async pricing(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{
    tender: Tender;
    items: BOQItem[];
    buildUps: Record<string, RateBuildUp>;
    estimate: TenderEstimate | null;
    rates: { technician: number; engineer: number; projectManager: number };
    quotations: Array<Pick<Quotation, 'id' | 'quoteNumber' | 'status' | 'total' | 'issueDate'>>;
    /** Governance state, server-owned — the UI renders it, it never re-derives the rule. */
    locked: boolean;
    /** Which committed quotations froze the sheet (empty when open). */
    lockedBy: Array<Pick<Quotation, 'id' | 'quoteNumber' | 'revision' | 'status'>>;
  }> {
    const ctx = this.tenant.get();
    const tender = await this.tenderOr404(id);
    const { items } = await this.tenders.getOrCreateBOQ(ctx.tenantId, ctx.companyId ?? null, id);
    const [buildUps, estimate, rates, generated] = await Promise.all([
      this.estimates.listByTender(ctx.tenantId, id),
      this.estimates.tenderEstimate(ctx.tenantId, id),
      this.hourlyRates(ctx.tenantId),
      this.quotations.listBySourceTender(ctx.tenantId, id),
    ]);
    const committed = generated.filter((q) => isQuotationCommitted(q));
    return {
      tender,
      items,
      buildUps: Object.fromEntries(buildUps.map((b) => [b.boqItemId, b])),
      estimate,
      rates,
      quotations: generated.map((q) => ({ id: q.id, quoteNumber: q.quoteNumber, status: q.status, total: q.total, issueDate: q.issueDate })),
      locked: committed.length > 0,
      lockedBy: committed.map((q) => ({ id: q.id, quoteNumber: q.quoteNumber, revision: q.revision, status: q.status })),
    };
  }

  /** Save one BOQ item's resource breakdown — compiles to components, prices the line, writes the rate back to the BOQ. */
  @Post(':id/pricing/items/:itemId')
  async priceItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('itemId', ParseUuidOr404Pipe) itemId: string,
    @Body() dto: { resources?: Partial<ResourceBreakdown>; indirectPercent?: number; overheadPercent?: number; profitPercent?: number; notes?: string },
  ): Promise<RateBuildUp> {
    await this.tenderOr404(id);
    await this.assertEstimateNotCommitted(id);
    if (!dto?.resources || typeof dto.resources !== 'object') throw new BadRequestException('resources breakdown is required');
    const ctx = this.tenant.get();
    try {
      return await this.estimates.buildRate(
        {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId ?? null,
          boqItemId: itemId,
          resources: dto.resources as ResourceBreakdown,
          indirectPercent: dto.indirectPercent,
          overheadPercent: dto.overheadPercent,
          profitPercent: dto.profitPercent,
          notes: dto.notes ?? null,
          createdBy: ctx.actorId ?? null,
        },
        { applyToBoq: true },
      );
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'pricing failed');
    }
  }

  /**
   * Bid-time sourcing (R5): price ONE build-up component from a procurement RFQ quote. Resolves
   * the quote (procurement owns it), stamps its unit cost onto the component and re-prices the
   * build-up. `changing the quote restamps` is handled by the award reactor.
   */
  @Post(':id/pricing/buildups/:buildUpId/components/:componentId/source')
  async sourceComponent(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('buildUpId', ParseUuidOr404Pipe) buildUpId: string,
    @Param('componentId', ParseUuidOr404Pipe) componentId: string,
    @Body() dto: { rfqId?: string; quoteId?: string },
  ): Promise<RateBuildUp> {
    await this.tenderOr404(id);
    await this.assertEstimateNotCommitted(id);
    const ctx = this.tenant.get();
    if (!dto?.rfqId || !dto?.quoteId) throw new BadRequestException('rfqId and quoteId are required');
    const quote = await this.resolveQuote(dto.rfqId, dto.quoteId);
    try {
      const { buildUp } = await this.estimateSourcing.source({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId ?? null,
        buildUpId,
        componentId,
        rfqId: dto.rfqId,
        quoteId: dto.quoteId,
        supplierName: quote.supplierName,
        quoteAmount: quote.amount,
        actorId: ctx.actorId ?? null,
      });
      return buildUp;
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'sourcing failed');
    }
  }

  /** Un-source a component: revert to its pre-source rate and drop the link. */
  @Delete(':id/pricing/buildups/:buildUpId/components/:componentId/source')
  async unsourceComponent(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('buildUpId', ParseUuidOr404Pipe) buildUpId: string,
    @Param('componentId', ParseUuidOr404Pipe) componentId: string,
  ): Promise<{ ok: true }> {
    await this.tenderOr404(id);
    await this.assertEstimateNotCommitted(id);
    const ctx = this.tenant.get();
    await this.estimateSourcing.unsource(ctx.tenantId, buildUpId, componentId, ctx.actorId ?? null);
    return { ok: true };
  }

  /** Every sourced component on this tender, each flagged stale when the live quote has drifted. */
  @Get(':id/pricing/sources')
  async sources(
    @Param('id', ParseUuidOr404Pipe) id: string,
  ): Promise<Array<EstimateSource & { liveQuoteAmount: number | null; stale: boolean }>> {
    await this.tenderOr404(id);
    const ctx = this.tenant.get();
    const links = await this.estimateSourcing.listByTender(ctx.tenantId, id);
    // Resolve live quote amounts once per RFQ.
    const liveByQuote = new Map<string, number | null>();
    for (const rfqId of new Set(links.map((l) => l.rfqId))) {
      const withQuotes = await this.rfqs.getWithQuotes(rfqId);
      for (const q of withQuotes?.quotes ?? []) liveByQuote.set(q.id, q.amount);
    }
    return links.map((l) => {
      const liveQuoteAmount = liveByQuote.has(l.quoteId) ? (liveByQuote.get(l.quoteId) ?? null) : null;
      return { ...l, liveQuoteAmount, stale: isSourceStale(l, liveQuoteAmount) };
    });
  }

  /** Resolve an RFQ quote to its amount + supplier (procurement owns the RFQ). */
  private async resolveQuote(rfqId: string, quoteId: string): Promise<{ amount: number; supplierName: string }> {
    const withQuotes = await this.rfqs.getWithQuotes(rfqId);
    const quote = withQuotes?.quotes.find((q) => q.id === quoteId);
    if (!quote || quote.tenantId !== this.tenant.get().tenantId) throw new NotFoundException(`quote ${quoteId} not found on RFQ ${rfqId}`);
    return { amount: quote.amount, supplierName: quote.supplierName };
  }

  /**
   * Generate the client quotation from the tender's priced BOQ. Priced items carry
   * their selling rate; unpriced items fall back to their current BOQ rate. The
   * quotation is created as a DRAFT in CRM — review it, then send.
   */
  @Post(':id/quotation')
  async generateQuotation(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { validUntil?: string; vatRate?: number } = {},
  ): Promise<Quotation> {
    const ctx = this.tenant.get();
    const tender = await this.tenderOr404(id);
    const { items } = await this.tenders.getOrCreateBOQ(ctx.tenantId, ctx.companyId ?? null, id);
    if (items.length === 0) throw new BadRequestException('the tender has no BOQ items — add the scope before generating a quotation');
    const buildUps = await this.estimates.listByTender(ctx.tenantId, id);
    const byItem = new Map(buildUps.map((b) => [b.boqItemId, b]));

    let priced = 0;
    const vatRate = dto?.vatRate === undefined ? undefined : Number(dto.vatRate);
    const lines: NewQuotationLine[] = items.map((item) => {
      const b = byItem.get(item.id);
      if (b) priced += 1;
      return {
        description: `[${item.itemCode}] ${item.description} (${item.unit})`,
        quantity: item.quantity,
        unitPrice: b ? b.sellingRate : item.rate,
        ...(vatRate !== undefined ? { vatRate } : {}),
      };
    });
    if (lines.every((l) => l.unitPrice <= 0)) {
      throw new BadRequestException('no line has a price — fill the pricing sheet (or BOQ rates) first');
    }

    const quoteNumber = await this.numbering.generateNextNumber(ctx.tenantId, ctx.companyId ?? null, 'crm', 'quotation', 'QUO');
    const quotation = await this.quotations.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? null,
      quoteNumber,
      customerName: tender.accountName ?? tender.title,
      accountId: tender.accountId,
      sourceTenderId: tender.id,
      issueDate: new Date().toISOString().slice(0, 10),
      validUntil: dto?.validUntil ?? null,
      lines,
      createdBy: ctx.actorId ?? null,
    });

    await this.estimates.recordQuotationGenerated({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? null,
      actorId: ctx.actorId ?? null,
      tenderId: tender.id,
      quotationId: quotation.id,
      quoteNumber: quotation.quoteNumber,
      total: quotation.total,
      pricedLines: priced,
      unpricedLines: items.length - priced,
    });
    return quotation;
  }
}
