import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, Inject, NotFoundException, Param, Post, StreamableFile } from '@nestjs/common';
import { DOCUMENT_REQUIREMENT_STORE, NumberingService, ParseUuidOr404Pipe, Permissions, SettingsService, TenantContext, type DocumentRequirementStore } from '@aura/core';
import { COMMERCIAL_EVIDENCE_TEMPLATE, admitCurrency, makeDocumentRequirement, toCsv } from '@aura/shared';
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
import {
  CommercialComparisonService, PurchaseRequestLineService, PurchaseRequestService, QuotationLineEvaluationService,
  QuotationLineService, RfqService, isTenderPricing, type PurchaseRequest, type PurchaseRequestLine,
} from '@aura/procurement';
import { MaterialService } from '@aura/inventory';
import { ArrayNotEmpty, IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import * as XLSX from 'xlsx';

/**
 * One supply line of a tender-pricing requisition: THIS BOQ item IS THIS material.
 *
 * Both ids are chosen by the person raising it. Nothing here matches free text — "IP camera, 4MP
 * dome" in a BOQ and a material record are the same thing only because somebody said so, and the
 * requisition line records who.
 */
class PricingRequisitionLineDto {
  @IsString() boqItemId!: string;
  @IsString() materialId!: string;
  /** Defaults to the BOQ item's own quantity — the scope the bid is priced on. */
  @IsOptional() @IsNumber() quantity?: number;
}

class CreatePricingRequisitionDto {
  @IsOptional() @IsString() title?: string;
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => PricingRequisitionLineDto)
  lines!: PricingRequisitionLineDto[];
}

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
    // The tender's supply scope is priced through procurement's own authorities, as a requisition
    // that buys nothing (migration 0387). The material master is read, never written, from here.
    private readonly prs: PurchaseRequestService,
    private readonly prLines: PurchaseRequestLineService,
    private readonly materials: MaterialService,
    // A governed price basis: the supplier's line, its technical eligibility, and the commercial
    // comparison that normalised it — procurement's own authorities, read and never re-implemented.
    private readonly quotationLines: QuotationLineService,
    private readonly evaluations: QuotationLineEvaluationService,
    private readonly comparison: CommercialComparisonService,
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

  /**
   * RAISE THE TENDER'S PRICING REQUISITION — its supply scope, put to suppliers.
   *
   * Procurement already owns everything a real supplier price needs: the RFQ, each supplier's
   * quotation revisions line by line, a technical verdict per line and a governed commercial
   * comparison. All of it is keyed to a requisition line. So the bid's supply scope is written as a
   * requisition — one that prices and never buys (migration 0387 and `TenderPricingBoundary`).
   *
   * EVERYTHING IS CHECKED BEFORE ANYTHING IS WRITTEN: each BOQ item must be on THIS tender's current
   * BOQ, each material must exist and be in use, and the material's unit must be the BOQ item's unit
   * — a quotation priced per roll cannot price a BOQ line measured in metres, and converting one to
   * the other is a separate act, not a mapping.
   */
  @Permissions('procurement.tender-sourcing.create')
  @Post(':id/pricing-requisitions')
  async createPricingRequisition(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: CreatePricingRequisitionDto,
  ): Promise<{ requisition: PurchaseRequest; lines: PurchaseRequestLine[] }> {
    const ctx = this.tenant.get();
    const { tender, boq, items } = await this.governedPricingContext(id);
    const basis = boq.sourceBasisRevisionId;
    if (!basis) throw new ConflictException('pricing requires the approved take-off the BOQ was projected from');
    const byItem = new Map(items.map((item) => [item.id, item]));

    const planned: Array<{ item: BOQItem; materialId: string; quantity: number }> = [];
    for (const [index, line] of dto.lines.entries()) {
      const item = byItem.get(line.boqItemId);
      if (!item) {
        throw new BadRequestException(`line ${index + 1}: BOQ item ${line.boqItemId} is not present in this tender's current BOQ`);
      }
      let material;
      try {
        material = await this.materials.get(line.materialId, ctx.tenantId);
      } catch {
        throw new NotFoundException(`line ${index + 1}: material ${line.materialId} not found`);
      }
      if (material.status === 'obsolete') {
        throw new BadRequestException(`line ${index + 1}: material ${material.code} is obsolete and cannot be priced`);
      }
      const unit = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
      if (unit(material.uom) !== unit(item.unit)) {
        throw new BadRequestException(
          `line ${index + 1}: material ${material.code} is measured in '${material.uom}' and BOQ item ${item.itemCode} in '${item.unit}' — ` +
            'the units must match, because the supplier prices will price this BOQ line',
        );
      }
      const quantity = line.quantity ?? item.quantity;
      if (!(quantity > 0)) throw new BadRequestException(`line ${index + 1}: quantity must be greater than zero`);
      planned.push({ item, materialId: material.id, quantity });
    }

    const requisition = await this.prs.createForTenderPricing({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? null,
      title: dto.title?.trim() || `Pricing — ${tender.title}`,
      sourceTenderId: tender.id,
      sourceBasisRevisionId: basis,
      createdBy: ctx.actorId ?? null,
    });
    const lines: PurchaseRequestLine[] = [];
    for (const { item, materialId, quantity } of planned) {
      lines.push(await this.prLines.addLine({ prId: requisition.id, material: materialId, quantity, sourceBoqItemId: item.id }));
    }
    return { requisition, lines };
  }

  /** The tender's pricing requisitions and their mapped lines. */
  @Permissions('tendering.estimate.read')
  @Get(':id/pricing-requisitions')
  async listPricingRequisitions(
    @Param('id', ParseUuidOr404Pipe) id: string,
  ): Promise<Array<{ requisition: PurchaseRequest; lines: PurchaseRequestLine[] }>> {
    const tender = await this.tenderOr404(id);
    const ctx = this.tenant.get();
    const requisitions = await this.prs.list({ tenantId: ctx.tenantId, sourceTenderId: tender.id, purpose: 'tender_pricing', limit: 50 });
    const out: Array<{ requisition: PurchaseRequest; lines: PurchaseRequestLine[] }> = [];
    for (const requisition of requisitions) {
      out.push({ requisition, lines: await this.prLines.listLines(requisition.id) });
    }
    return out;
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
    @Body() dto: { rfqId?: string; quoteId?: string; quotationLineId?: string; comparisonDate?: string },
  ): Promise<RateBuildUp> {
    await this.governedPricingContext(id);
    await this.assertEstimateNotCommitted(id);
    const ctx = this.tenant.get();

    if (dto?.quotationLineId) {
      return this.sourceFromGovernedLine(id, buildUpId, componentId, dto.quotationLineId, dto.comparisonDate);
    }

    /**
     * THE LEGACY HEADER, REFUSED WHERE THE GOVERNED PATH EXISTS. A tender whose supply scope has been
     * put to suppliers through a pricing requisition has real lines, technical verdicts and a governed
     * comparison. Pricing it instead from a whole-quote header amount — no material, no line, no
     * judgement — would be choosing the weaker evidence when the stronger one is there (BID-01).
     */
    const pricingRequisitions = await this.prs.list({ tenantId: ctx.tenantId, sourceTenderId: id, purpose: 'tender_pricing', limit: 1 });
    if (pricingRequisitions.length > 0) {
      throw new ConflictException(
        'this tender prices its supply from governed supplier quotations — source the component from a quotation line, ' +
          'not from a quote header, which names no material and carries no technical verdict',
      );
    }
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
    // LEGACY links: resolve live quote-header amounts once per RFQ.
    const liveByQuote = new Map<string, number | null>();
    for (const rfqId of new Set(links.filter((l) => l.quoteId && l.rfqId).map((l) => l.rfqId as string))) {
      const withQuotes = await this.rfqs.getWithQuotes(rfqId);
      for (const q of withQuotes?.quotes ?? []) liveByQuote.set(q.id, q.amount);
    }
    const out: Array<EstimateSource & { liveQuoteAmount: number | null; stale: boolean }> = [];
    for (const l of links) {
      if (l.governed) {
        /**
         * A GOVERNED link is re-read on the SAME comparison date it was taken on, so the only thing
         * that can move it is the supplier's offer — a new revision, a withdrawal, a changed price —
         * and never the exchange rate drifting underneath. Its line gone from the comparison is stale.
         */
        const compared = await this.comparison.compareRequirement(ctx.tenantId, l.governed.prLineId, {
          baseCurrency: l.governed.currency, comparisonDate: l.governed.comparisonDate,
        }).catch(() => null);
        const row = compared?.offers.find((o) => o.quotationLineId === l.governed?.quotationLineId);
        const liveQuoteAmount = row && row.normalisedUnitPrice.status === 'comparable' ? row.normalisedUnitPrice.unitValue : null;
        out.push({ ...l, liveQuoteAmount, stale: isSourceStale(l, liveQuoteAmount) });
        continue;
      }
      const liveQuoteAmount = l.quoteId && liveByQuote.has(l.quoteId) ? (liveByQuote.get(l.quoteId) ?? null) : null;
      out.push({ ...l, liveQuoteAmount, stale: isSourceStale(l, liveQuoteAmount) });
    }
    return out;
  }

  /**
   * SOURCE A COMPONENT FROM A GOVERNED SUPPLIER QUOTATION LINE — the only way a tender with a
   * pricing requisition may take a supplier price.
   *
   * Every one of these is checked, and each names what it protects:
   *
   *   * the line answers a requisition line of THIS tender's pricing requisition — not another bid's;
   *   * that requisition line prices THIS component's BOQ item — a camera is not priced from a cable
   *     quote, however the ids are passed;
   *   * the component is a MATERIAL component — a supply price does not price labour;
   *   * the Technical Manager has judged the line ELIGIBLE — compliant, or compliant with deviation —
   *     through procurement's own `eligibilityFor`, not a verdict re-derived here;
   *   * the governed commercial comparison, read on a stated date, includes this exact line as
   *     COMPARABLE and LIVE — so the figure taken is the normalised one, in the tender's currency.
   *
   * The unit cost written is the comparison's normalised unit price, never the raw line price: the
   * comparison is where currency, tax basis and validity are made comparable, and pricing a bid from
   * anything else would be a second comparison engine with no governance.
   */
  private async sourceFromGovernedLine(
    tenderId: string, buildUpId: string, componentId: string, quotationLineId: string, comparisonDate?: string,
  ): Promise<RateBuildUp> {
    const ctx = this.tenant.get();
    const quoted = await this.quotationLines.get(ctx.tenantId, quotationLineId);
    if (!quoted) throw new NotFoundException(`quotation line ${quotationLineId} not found`);
    const requirement = await this.prLines.getLine(quoted.prLineId);
    const requisition = requirement ? await this.prs.get(requirement.prId) : null;
    if (!requirement || !requisition || !isTenderPricing(requisition) || requisition.sourceTenderId !== tenderId) {
      throw new ConflictException('the quotation line does not answer this tender\'s pricing requisition — a price for another bid cannot price this one');
    }

    const buildUp = (await this.estimates.listByTender(ctx.tenantId, tenderId)).find((b) => b.id === buildUpId);
    if (!buildUp) throw new NotFoundException(`build-up ${buildUpId} not found on this tender`);
    if (requirement.sourceBoqItemId !== buildUp.boqItemId) {
      throw new ConflictException('the quotation line prices a different BOQ item than this component\'s — a supplier price is taken only for the item it was asked for');
    }
    const component = buildUp.components.find((c) => c.id === componentId);
    if (!component) throw new NotFoundException(`component ${componentId} not found in build-up ${buildUpId}`);
    if (component.costType !== 'material') {
      throw new ConflictException(`a supplier's supply price can only price a material component — this one is ${component.costType}`);
    }

    const technical = await this.evaluations.eligibilityFor(ctx.tenantId, quotationLineId);
    if (technical.eligibility !== 'eligible' || !technical.verdict || technical.verdict === 'non_compliant') {
      throw new ConflictException(
        technical.eligibility === 'not_eligible'
          ? 'the Technical Manager judged this line non-compliant — it is not a market alternative for this requirement, whatever its price'
          : 'this line has no current technical verdict — a supplier price becomes a basis only after it has been judged',
      );
    }

    const baseCurrency = (await this.settings.get(ctx.tenantId, 'finance.defaultCurrency').catch(() => null))?.trim() || 'AED';
    const admitted = admitCurrency(baseCurrency);
    if (!admitted.admissible) throw new ConflictException(admitted.detail);
    const date = (comparisonDate ?? new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('comparisonDate must be a date in YYYY-MM-DD form');
    const compared = await this.comparison.compareRequirement(ctx.tenantId, requirement.id, { baseCurrency: admitted.currency, comparisonDate: date });
    const row = compared.offers.find((o) => o.quotationLineId === quotationLineId);
    if (!row || !row.provenance) {
      throw new ConflictException('the governed comparison does not carry this line as a current offer — its revision may have been superseded or withdrawn');
    }
    if (row.commercialStatus !== 'live') {
      throw new ConflictException(`this offer is ${row.commercialStatus === 'expired' ? 'past its validity' : 'of unknown validity'} on ${date} — an expired price is not a basis`);
    }
    if (row.normalisedUnitPrice.status !== 'comparable') {
      throw new ConflictException(`the comparison could not normalise this line (${row.normalisedUnitPrice.reason ?? 'no comparable value'}) — an unnormalised figure is not a basis`);
    }

    try {
      const { buildUp: updated } = await this.estimateSourcing.source({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId ?? null,
        buildUpId,
        componentId,
        // The lineage IS the revision and the line; the comparison names no RFQ, and a governed link
        // must not be found by the legacy per-RFQ restamp anyway.
        rfqId: null,
        governed: {
          quotationRevisionId: row.provenance.revisionId,
          quotationLineId,
          prLineId: requirement.id,
          materialId: requirement.materialId,
          currency: row.normalisedUnitPrice.currency,
          technicalVerdict: technical.verdict,
          comparisonDate: date,
        },
        supplierName: row.supplierName,
        quoteAmount: row.normalisedUnitPrice.unitValue,
        actorId: ctx.actorId ?? null,
      });
      return updated;
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'sourcing failed');
    }
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
