import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, Inject, NotFoundException, Param, Post, StreamableFile } from '@nestjs/common';
import { DOCUMENT_REQUIREMENT_STORE, NumberingService, ParseUuidOr404Pipe, Permissions, SettingsService, TenantContext, type DocumentRequirementStore } from '@aura/core';
import { COMMERCIAL_EVIDENCE_TEMPLATE, makeDocumentRequirement, toCsv } from '@aura/shared';
import {
  EstimateService,
  EstimateSourcingService,
  PRICING_SHEET_CSV_COLUMNS,
  PRICING_SUMMARY_CSV_COLUMNS,
  TenderService,
  isSourceStale,
  tenderBuildUpToEstimationLine,
  pricingSheetCsvRows,
  type BOQItem,
  type EstimateSource,
  type RateBuildUp,
  type ResourceBreakdown,
  type TenderEstimate,
  type Tender,
} from '@aura/tendering';
import { PreAwardPackageService, QuotationService, isQuotationCommitted, type NewQuotationLine, type Quotation } from '@aura/crm';
import { RfqService } from '@aura/procurement';
import * as XLSX from 'xlsx';

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
  risk: number;
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
    private readonly packages: PreAwardPackageService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly tenant: TenantContext,
    // The offer this controller generates is approved behind an evidence checklist. Nothing seeded
    // one, so every offer generated here was unapprovable — see `generateQuotation`.
    @Inject(DOCUMENT_REQUIREMENT_STORE) private readonly requirements: DocumentRequirementStore,
  ) {}

  private async tenderOr404(id: string): Promise<Tender> {
    const tender = await this.tenders.get(id);
    if (!tender || tender.tenantId !== this.tenant.get().tenantId) throw new NotFoundException(`tender ${id} not found`);
    return tender;
  }

  /**
   * Pricing is downstream of both technical approval and independently approved quantities.
   * The caller supplies only the Tender id. The server resolves Tender → approved study and the
   * persisted Tender → BOQ → approved take-off relation, so a URL/body cannot substitute a basis.
   */
  private async governedPricingContext(id: string) {
    const ctx = this.tenant.get();
    const tender = await this.tenderOr404(id);
    await this.packages.approvedTechnicalStudyForTender(ctx.tenantId, tender.id);
    const current = await this.tenders.getBOQByTender(ctx.tenantId, tender.id);
    if (!current?.boq.sourceBasisRevisionId || !current.boq.projectedAt) {
      throw new ConflictException(
        'pricing requires an approved quantity take-off projected to the BOQ — complete quantities, obtain Technical Manager approval, then send the approved take-off to Estimation',
      );
    }
    return { tender, ...current };
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

    /**
     * UNDER REVIEW IS ALREADY TOO LATE TO RE-PRICE.
     *
     * The lock below starts at `approved`, which left the review window open: an approver could be
     * looking at a set of figures while the estimator reworked the costing underneath them, and
     * the offer they signed would rest on a build-up nobody reviewed. Measured before this branch
     * existed — with the offer sitting in `internal_review`, re-pricing a line was accepted and
     * the tender's selling value moved from 179,821.20 to 2,279,774.40 while the offer kept its
     * own snapshot at 117,804.00. The offer did not silently change; nothing said it no longer
     * matched its source either.
     *
     * Asking for a decision is what seals the costing. EST-17 requires approvers to "review the
     * same frozen build-up", and a build-up that can move during the review is not that.
     */
    const underReview = generated.filter((q) => q.status === 'internal_review');
    if (underReview.length > 0) {
      const which = underReview.map((q) => `${q.quoteNumber} Rev ${q.revision}`).join(', ');
      throw new ConflictException(
        `tender pricing sheet is locked: ${which} ${underReview.length === 1 ? 'is' : 'are'} with a ` +
          `commercial reviewer, and the costing behind figures somebody is deciding on cannot be ` +
          `re-worked while they decide. To change it, have the reviewer return the offer for revision.`,
      );
    }

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
      const governed = await this.tenders.getBOQByTender(tenantId, tid);
      // The hub must not advertise legacy/manual sheets as approved estimation work.
      if (!governed?.boq.sourceBasisRevisionId || !governed.boq.projectedAt) continue;
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
        risk: estimate.totalRisk,
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
  @Permissions('tendering.estimate.read', 'tendering.internal-pricing.access')
  @Get('pricing/sheets')
  async sheets(): Promise<SheetSummary[]> {
    return this.sheetSummaries(this.tenant.get().tenantId);
  }

  /** All sheets as a summary CSV (one row per tender). */
  @Permissions('tendering.estimate.read', 'tendering.internal-pricing.access')
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
  @Permissions('tendering.estimate.read', 'tendering.internal-pricing.access')
  @Get(':id/pricing/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pricing-sheet.csv"')
  async sheetCsv(@Param('id', ParseUuidOr404Pipe) id: string): Promise<string> {
    const ctx = this.tenant.get();
    const { items } = await this.governedPricingContext(id);
    const buildUps = await this.estimates.listByTender(ctx.tenantId, id);
    return toCsv(pricingSheetCsvRows(items, buildUps), [...PRICING_SHEET_CSV_COLUMNS]);
  }

  /**
   * Native internal workbook for one Tender estimate. The approved Technical Study is resolved
   * from the persisted Tender relation, so neither a query nor a request body can relabel the
   * workbook with another study. BOQ/build-up/source ids are retained for audit and reconciliation.
   */
  @Permissions('tendering.estimate.read', 'tendering.internal-pricing.access')
  @Get(':id/pricing.xlsx')
  async sheetXlsx(@Param('id', ParseUuidOr404Pipe) id: string): Promise<StreamableFile> {
    const ctx = this.tenant.get();
    const { tender, boq, items } = await this.governedPricingContext(id);
    const study = await this.packages.approvedTechnicalStudyForTender(ctx.tenantId, tender.id);
    const [buildUps, estimate, sources, companyName, legalName, currency] = await Promise.all([
      this.estimates.listByTender(ctx.tenantId, id),
      this.estimates.tenderEstimate(ctx.tenantId, id),
      this.estimateSourcing.listByTender(ctx.tenantId, id),
      this.settings.get(ctx.tenantId, 'company.name'),
      this.settings.get(ctx.tenantId, 'company.legalName'),
      this.settings.get(ctx.tenantId, 'finance.defaultCurrency'),
    ]);
    if (!estimate || items.length === 0 || buildUps.length === 0) {
      throw new BadRequestException('an internal pricing workbook requires a persisted BOQ and cost build-up for this tender');
    }

    const tenderCurrency = currency || 'AED';
    const summary = XLSX.utils.aoa_to_sheet([
      ['Internal Tender pricing workbook', ''],
      ['Company', legalName || companyName || ''],
      ['Tender', tender.title],
      ['Tender ID', tender.id],
      ['Tender reference', tender.reference ?? ''],
      ['Client', tender.accountName ?? ''],
      ['Tender status', tender.status],
      ['Currency', tenderCurrency],
      ['Approved Technical Study', study.title],
      ['Technical Study ID', study.id],
      ['Technical Study revision', study.revisionNo],
      ['Client input revision', study.inputRevision],
      ['BOQ ID', boq.id],
      ['Approved Quantity Take-Off ID', boq.sourceBasisRevisionId ?? ''],
      ['Quantity source revision', boq.sourceRevisionRef ?? ''],
      ['Quantity projection time', boq.projectedAt ?? ''],
      ['Quantity projected by', boq.projectedBy ?? ''],
      ['BOQ items', estimate.itemCount],
      ['Priced items', estimate.estimatedItemCount],
      ['Total direct cost', estimate.totalDirectCost],
      ['Total indirect cost', estimate.totalIndirect],
      ['Total overhead', estimate.totalOverhead],
      ['Total risk / contingency', estimate.totalRisk],
      ['Total profit', estimate.totalProfit],
      ['Total selling value', estimate.totalSellingValue],
      ['Unpriced BOQ value', estimate.unpricedBoqValue],
      ['Estimated Tender value', estimate.estimatedTenderValue],
      ['Blended margin %', estimate.marginPercent],
    ]);
    summary['!cols'] = [{ wch: 30 }, { wch: 48 }];

    const byItem = new Map(buildUps.map((buildUp) => [buildUp.boqItemId, buildUp]));
    const csvRows = pricingSheetCsvRows(items, buildUps);
    const detailRows = items.map((item, index) => {
      const buildUp = byItem.get(item.id);
      const row = csvRows[index];
      return {
        'BOQ item ID': item.id,
        'Build-up ID': buildUp?.id ?? '',
        'Technical Study ID': study.id,
        'Study revision': study.revisionNo,
        'Input revision': study.inputRevision,
        'Item code': row.itemCode,
        Description: row.description,
        Unit: row.unit,
        Quantity: row.quantity,
        'IFC GUID': item.ifcGuid ?? '',
        'Supply unit price': row.supplyUnitPrice,
        'Material total': row.materialTotal,
        'Wastage %': row.wastagePercent,
        'Accessories / consumables': row.accessories,
        'Technician count': row.techCount,
        'Technician hours': row.techHours,
        'Technician rate': row.techRate,
        'Technician total': row.techTotal,
        'Engineer count': row.engCount,
        'Engineer hours': row.engHours,
        'Engineer rate': row.engRate,
        'Engineer total': row.engTotal,
        'PM count': row.pmCount,
        'PM hours': row.pmHours,
        'PM rate': row.pmRate,
        'PM total': row.pmTotal,
        'Manpower total': row.manpowerTotal,
        Transport: row.transport,
        'Equipment rent': row.equipmentRent,
        Subcontract: row.subcontract,
        'Other direct': row.otherDirect,
        'Direct cost': row.directCostLine,
        'Indirect %': row.indirectPercent,
        'Indirect amount': row.indirectAmountLine,
        'Overhead %': row.overheadPercent,
        'Overhead amount': row.overheadAmountLine,
        'Risk %': row.riskPercent,
        'Risk amount': row.riskAmountLine,
        'Profit %': row.profitPercent,
        'Profit amount': row.profitAmountLine,
        'Selling rate / unit': row.sellingRateUnit,
        'Line total': row.lineTotal,
        'Margin %': row.marginPercent,
        Status: row.status,
        Notes: buildUp?.notes ?? '',
      };
    });
    const detail = XLSX.utils.json_to_sheet(detailRows);
    if (detailRows.length > 0) detail['!autofilter'] = { ref: detail['!ref']! };
    detail['!cols'] = [
      { wch: 38 }, { wch: 38 }, { wch: 38 }, { wch: 14 }, { wch: 22 },
      { wch: 14 }, { wch: 42 }, { wch: 10 }, ...Array.from({ length: 37 }, () => ({ wch: 16 })),
    ];

    const sourceRows = sources.map((source) => ({
      'Source link ID': source.id,
      'BOQ item ID': source.boqItemId,
      'Build-up ID': source.buildUpId,
      'Component ID': source.componentId,
      'RFQ ID': source.rfqId,
      'Supplier quote ID': source.quoteId,
      Supplier: source.supplierName,
      'Sourced unit cost': source.sourcedUnitCost,
      'Previous unit cost': source.previousUnitCost,
      'Sourced at': source.sourcedAt,
      'Created by': source.createdBy ?? '',
    }));
    const sourceSheet = XLSX.utils.json_to_sheet(sourceRows.length > 0 ? sourceRows : [{ Status: 'No supplier quotation links recorded for this estimate.' }]);
    if (sourceRows.length > 0) sourceSheet['!autofilter'] = { ref: sourceSheet['!ref']! };
    sourceSheet['!cols'] = Array.from({ length: 11 }, () => ({ wch: 28 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, summary, 'Summary');
    XLSX.utils.book_append_sheet(workbook, detail, 'Cost Breakdown');
    XLSX.utils.book_append_sheet(workbook, sourceSheet, 'Supplier Sources');
    workbook.Props = {
      Title: `${tender.reference || tender.title} internal Tender pricing`,
      Subject: `Cost and selling basis from approved Technical Study S-${String(study.revisionNo).padStart(3, '0')}`,
      Author: legalName || companyName || 'AURA',
      Comments: `Generated from Tender ${tender.id}, BOQ ${boq.id}, Technical Study ${study.id}; internal commercial data.`,
    };
    const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
    const safeReference = (tender.reference || tender.title || tender.id).replace(/[^a-zA-Z0-9._-]+/g, '-');
    return new StreamableFile(bytes, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${safeReference}-internal-pricing.xlsx"`,
      length: bytes.length,
    });
  }

  /** Everything the pricing sheet page needs in one fetch. */
  @Permissions('tendering.estimate.read', 'tendering.internal-pricing.access')
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
    const { tender, items } = await this.governedPricingContext(id);
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
  @Permissions('tendering.estimate.update', 'tendering.internal-pricing.access')
  @Post(':id/pricing/items/:itemId')
  async priceItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('itemId', ParseUuidOr404Pipe) itemId: string,
    @Body() dto: { resources?: Partial<ResourceBreakdown>; indirectPercent?: number; overheadPercent?: number; riskPercent?: number; profitPercent?: number; notes?: string },
  ): Promise<RateBuildUp> {
    const ctx = this.tenant.get();
    await this.governedPricingContext(id);
    await this.tenders.assertBOQItemOwnedByTender(ctx.tenantId, id, itemId).catch(() => {
      throw new NotFoundException('BOQ item not found for this Tender');
    });
    await this.assertEstimateNotCommitted(id);
    if (!dto?.resources || typeof dto.resources !== 'object') throw new BadRequestException('resources breakdown is required');
    try {
      return await this.estimates.buildRate(
        {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId ?? null,
          boqItemId: itemId,
          resources: dto.resources as ResourceBreakdown,
          indirectPercent: dto.indirectPercent,
          overheadPercent: dto.overheadPercent,
          riskPercent: dto.riskPercent,
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
  @Permissions('tendering.estimate.update', 'tendering.internal-pricing.access')
  @Post(':id/pricing/buildups/:buildUpId/components/:componentId/source')
  async sourceComponent(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('buildUpId', ParseUuidOr404Pipe) buildUpId: string,
    @Param('componentId', ParseUuidOr404Pipe) componentId: string,
    @Body() dto: { rfqId?: string; quoteId?: string },
  ): Promise<RateBuildUp> {
    await this.governedPricingContext(id);
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
  @Permissions('tendering.estimate.update', 'tendering.internal-pricing.access')
  @Delete(':id/pricing/buildups/:buildUpId/components/:componentId/source')
  async unsourceComponent(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('buildUpId', ParseUuidOr404Pipe) buildUpId: string,
    @Param('componentId', ParseUuidOr404Pipe) componentId: string,
  ): Promise<{ ok: true }> {
    await this.governedPricingContext(id);
    await this.assertEstimateNotCommitted(id);
    const ctx = this.tenant.get();
    await this.estimateSourcing.unsource(ctx.tenantId, buildUpId, componentId, ctx.actorId ?? null);
    return { ok: true };
  }

  /** Every sourced component on this tender, each flagged stale when the live quote has drifted. */
  @Permissions('tendering.estimate.read', 'tendering.internal-pricing.access')
  @Get(':id/pricing/sources')
  async sources(
    @Param('id', ParseUuidOr404Pipe) id: string,
  ): Promise<Array<EstimateSource & { liveQuoteAmount: number | null; stale: boolean }>> {
    await this.governedPricingContext(id);
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
  @Permissions('tendering.estimate.read', 'tendering.internal-pricing.access', 'crm.quotation.create')
  @Post(':id/quotation')
  async generateQuotation(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { validUntil?: string; vatRate?: number } = {},
  ): Promise<Quotation> {
    const ctx = this.tenant.get();
    const { tender, items } = await this.governedPricingContext(id);
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
        unit: item.unit,
        sourceItemId: item.id,
        unitPrice: b ? b.sellingRate : item.rate,
        ...(vatRate !== undefined ? { vatRate } : {}),
      };
    });
    if (lines.every((l) => l.unitPrice <= 0)) {
      throw new BadRequestException('no line has a price — fill the pricing sheet (or BOQ rates) first');
    }
    const estimation = items.map((item) => tenderBuildUpToEstimationLine(item, byItem.get(item.id) ?? null));

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
      estimation,
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

    /**
     * THE GATE IS CONFIGURED BY THE ACT THAT CREATES THE THING IT GATES.
     *
     * Approving a quotation requires an evidence checklist, and nothing on this path wrote one —
     * so every offer generated from a tender was refused approval for ever with "readiness
     * checklist is not configured", and with it the client-facing proposal and the tender
     * submission. Measured on a real tender before this line existed: the checklist came back with
     * zero rows and the approval 409'd whoever asked, including an administrator.
     *
     * Seeded here rather than left to a separate act somebody has to remember, because a control
     * that only works when a second person performs an unprompted step is a control that does not
     * work. Idempotent by the store's natural key, and it writes only what is absent: re-generating
     * an offer never resets a requirement somebody has already provided or waived.
     *
     * NOT fatal. A checklist that failed to seed must not lose the priced offer that was just
     * written — the approval refuses on its own, loudly and by name, and that is the control.
     */
    try {
      const existing = await this.requirements.list({
        tenantId: ctx.tenantId, entityType: 'crm.quotation', entityId: quotation.id,
      });
      const known = new Set(existing.map((r) => r.type));
      for (const t of COMMERCIAL_EVIDENCE_TEMPLATE) {
        if (known.has(t.type)) continue;
        await this.requirements.upsert(makeDocumentRequirement({
          tenantId: ctx.tenantId,
          entityType: 'crm.quotation',
          entityId: quotation.id,
          type: t.type,
          requiredCount: t.requiredCount,
        }));
      }
    } catch { /* the approval gate refuses an unconfigured checklist by itself */ }

    return quotation;
  }
}
