import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, StreamableFile } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Permissions, TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { type LineDiscountBasis, CommercialComparisonService, QuotationLineService, type QuotationLine } from '@aura/procurement';
import { admitCurrency } from '@aura/shared';

/**
 * What a supplier offered, item by item (Wave 4 supplier-decision spine).
 *
 * Every field a caller can set here is the SUPPLIER'S DECLARATION. There is deliberately no endpoint
 * to mark a line compliant, eligible or recommended: `SUP-01`'s frozen authority is the Procurement
 * RFQ context with the Technical Manager among its roles, so the verdict is an internal
 * determination recorded beside the line in a later slice — never written through this surface, and
 * never by the supplier's own words.
 *
 * Nothing here computes a comparable value either. Amounts are in the quotation's own currency and
 * are derived from quantity × unit price; conversion belongs to commercial normalisation with the
 * Finance FX authority behind it.
 */

interface QuotationLineDto {
  prLineId?: string;
  response?: 'quoted' | 'no_bid';
  offeredManufacturer?: string | null;
  offeredModel?: string | null;
  /** The SUPPLIER'S claim about the specification. Declared so the service can record it as a claim. */
  complianceResponse?: 'comply' | 'comply_with_deviation' | 'not_offered' | null;
  deviations?: string | null;
  exclusions?: string | null;
  quantity?: number | null;
  uom?: string | null;
  unitPrice?: number | null;
  lineDiscount?: number | null;
  /** WHICH KIND of discount — see LINE_DISCOUNT_BASES. Defaults to the one kind AURA records. */
  lineDiscountBasis?: LineDiscountBasis | null;
  leadTimeDays?: number | null;
  warrantyMonths?: number | null;
  notes?: string | null;
}

@Controller('procurement/quotations')
export class QuotationLinesController {
  constructor(
    private readonly lines: QuotationLineService,
    private readonly comparison: CommercialComparisonService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * SUP-06 — every offer against ONE requirement, made comparable.
   *
   * THE COMPARISON DATE IS A PARAMETER, not a default buried in the domain. The API supplies today
   * when the caller does not name one, so a screen can open with a sensible date; the domain never
   * reads the clock, and the date used comes back on every value. A buyer who reopens this tomorrow
   * and sees different numbers can see immediately that the date moved, rather than wondering
   * whether the offers did.
   *
   * It returns FACTS AND NO RANKING. There is no cheapest, no winner and no ordering by price here,
   * because a governed recommendation is SUP-13's authority and an ordering is a recommendation
   * wearing a different name.
   */
  @Permissions('procurement.rfq.read')
  @Get('by-requirement/:prLineId/comparison')
  compare(
    @Param('prLineId', ParseUuidOr404Pipe) prLineId: string,
    @Query('comparisonDate') comparisonDate?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ) {
    return this.comparison.compareRequirement(
      this.tenant.get().tenantId, prLineId, this.comparisonContext(comparisonDate, baseCurrency),
    );
  }

  /**
   * The comparison context a caller asked for, validated once for every surface that needs it.
   *
   * The date is a parameter and not a default buried in the domain; the API fills in today only so a
   * screen can open somewhere sensible, and whatever is used travels back on every value.
   */
  private comparisonContext(comparisonDate?: string, baseCurrency?: string) {
    const date = (comparisonDate ?? new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('comparisonDate must be a date in YYYY-MM-DD form');
    }
    const verdict = admitCurrency(baseCurrency ?? 'AED');
    if (!verdict.admissible) throw new BadRequestException(verdict.detail);
    return { baseCurrency: verdict.currency, comparisonDate: date };
  }

  /**
   * THE COMMERCIAL COMPARISON SHEET (XLSX).
   *
   * Built from the SAME service call the screen reads, so the spreadsheet cannot drift from what the
   * buyer was looking at — it renders that result and computes nothing of its own. An UNKNOWN stays
   * a written reason in the cell rather than becoming a blank or a zero, because a blank in a
   * spreadsheet gets summed and a zero gets compared.
   */
  @Permissions('procurement.rfq.read')
  @Get('by-requirement/:prLineId/comparison.xlsx')
  async comparisonSheet(
    @Param('prLineId', ParseUuidOr404Pipe) prLineId: string,
    @Query('comparisonDate') comparisonDate?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ): Promise<StreamableFile> {
    const context = this.comparisonContext(comparisonDate, baseCurrency);
    const result = await this.comparison.compareRequirement(this.tenant.get().tenantId, prLineId, context);

    const say = (v: { status: string; unitValue?: number; reason?: string; missingInputs?: string[] }) =>
      v.status === 'comparable' ? (v.unitValue as number) : `UNKNOWN — ${v.reason}${v.missingInputs?.length ? ` (${v.missingInputs.join('; ')})` : ''}`;

    const basis = XLSX.utils.json_to_sheet([
      { Field: 'Requirement', Value: `${result.materialCode ?? ''} ${result.materialName ?? ''}`.trim() },
      { Field: 'Requested quantity', Value: result.requestedQuantity ?? 'UNKNOWN' },
      { Field: 'Requested unit', Value: result.requestedUom ?? 'UNKNOWN' },
      { Field: 'Comparison date', Value: context.comparisonDate },
      { Field: 'Base currency', Value: context.baseCurrency },
      { Field: 'Tax basis', Value: 'ex-tax' },
      { Field: 'Freight basis', Value: 'excluded from line values; shown per quotation' },
      { Field: 'Recommendation', Value: 'NONE. These are comparable facts; selecting a supplier is a separate governed decision.' },
    ]);
    basis['!cols'] = [{ wch: 22 }, { wch: 96 }];

    const offers = XLSX.utils.json_to_sheet(result.offers.map((o) => ({
      Supplier: o.supplierName,
      'Requested qty': o.requestedQuantity ?? 'UNKNOWN',
      'Quoted qty': o.quotedQuantity ?? 'UNKNOWN',
      'Quantity deviation': o.quantityDeviation ?? 'UNKNOWN',
      'Coverage': o.coverageRatio ?? 'UNKNOWN',
      'Quantity compliance': o.quantityCompliance,
      'Requested unit': o.requestedUom ?? 'UNKNOWN',
      'Quoted unit': o.quotedUom ?? 'UNKNOWN',
      [`Unit price (${context.baseCurrency}, ex-tax, ex-freight)`]: say(o.normalisedUnitPrice),
      [`Requisition line total (${context.baseCurrency})`]: say(o.normalisedRequestedLineTotal),
      'FX source': o.normalisedUnitPrice.status === 'comparable' ? o.normalisedUnitPrice.fx.source : '',
      'FX rate': o.normalisedUnitPrice.status === 'comparable' ? o.normalisedUnitPrice.fx.rate : '',
      'FX effective': o.normalisedUnitPrice.status === 'comparable' ? (o.normalisedUnitPrice.fx.effectiveDate ?? '') : '',
      'Offer validity': o.validityDate ?? 'UNKNOWN',
      'Commercial status': o.commercialStatus,
    })));
    if (result.offers.length > 0) offers['!autofilter'] = { ref: offers['!ref']! };
    offers['!cols'] = [{ wch: 34 }, ...Array.from({ length: 14 }, () => ({ wch: 20 }))];

    const quotations = XLSX.utils.json_to_sheet(result.quotations.map((q) => ({
      Supplier: q.supplierName,
      Currency: q.currency ?? 'UNKNOWN',
      [`Freight (${context.baseCurrency}, ex-tax)`]: q.freight === null ? 'none quoted' : say(q.freight),
      'Freight terms': q.freightTerms ?? '',
      'Payment terms': q.paymentTerms ?? '',
      'Offer validity': q.validityDate ?? 'UNKNOWN',
      'Commercial status': q.commercialStatus,
      Note: 'Freight is quoted for the offer as a whole and is NOT allocated to lines.',
    })));
    quotations['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 26 }, { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 70 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, basis, 'Basis');
    XLSX.utils.book_append_sheet(workbook, offers, 'Offers');
    XLSX.utils.book_append_sheet(workbook, quotations, 'Quotation charges');
    workbook.Props = {
      Title: `Commercial comparison — ${result.materialName ?? prLineId}`,
      Subject: `Comparable facts as at ${context.comparisonDate}, ex-tax, ex-freight, in ${context.baseCurrency}`,
      Comments: 'Comparable facts only. No recommendation is expressed or implied.',
    };

    const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
    const safe = (result.materialCode ?? prLineId).replace(/[^a-zA-Z0-9._-]+/g, '-');
    return new StreamableFile(bytes, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${safe}-commercial-comparison-${context.comparisonDate}.xlsx"`,
      length: bytes.length,
    });
  }


  /**
   * The offers, each carrying the technical decision made about it.
   *
   * `SUP-01`'s OUTBOUND handoff: the verdict reaches the Buyer here, in the Buyer's own context and
   * under the Buyer's own permission, rather than requiring them to look it up on the technical
   * surface they cannot open. The rationale and amendment history stay there.
   */
  @Permissions('procurement.rfq.read')
  @Get(':id/lines')
  list(@Param('id', ParseUuidOr404Pipe) id: string) {
    // `:id` is a quotation REVISION. A verdict belongs to the lines of a specific revision — one
    // recorded against Rev 1 must not silently attach itself to Rev 2's different price.
    return this.lines.listByRevisionForBuyer(this.tenant.get().tenantId, id);
  }

  /**
   * Every supplier's answer to ONE requirement.
   *
   * The read a comparison is built from, and the reason the grain is the requisition line: a buyer
   * asks "what did everyone offer for this item", not "what did this supplier say".
   */
  @Permissions('procurement.rfq.read')
  @Get('by-requirement/:prLineId')
  byRequirement(@Param('prLineId', ParseUuidOr404Pipe) prLineId: string): Promise<QuotationLine[]> {
    return this.lines.listByRequirement(this.tenant.get().tenantId, prLineId);
  }

  /**
   * `:id` is a quotation REVISION. An alternative is no longer a flag on a line: it is a separate
   * OFFER with its own revisions (QC-01), which is the only way a supplier offering two variants for
   * one requirement can be recorded at all.
   */
  @Permissions('procurement.rfq.update')
  @Post(':id/lines')
  add(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: QuotationLineDto): Promise<QuotationLine> {
    if (!dto?.prLineId?.trim()) {
      throw new BadRequestException('prLineId is required — a quotation line must answer a requisition line');
    }
    const ctx = this.tenant.get();
    return this.lines.add(ctx.tenantId, {
      revisionId: id,
      prLineId: dto.prLineId,
      response: dto.response,
      offeredManufacturer: dto.offeredManufacturer ?? null,
      offeredModel: dto.offeredModel ?? null,
      complianceResponse: dto.complianceResponse ?? null,
      deviations: dto.deviations ?? null,
      exclusions: dto.exclusions ?? null,
      quantity: dto.quantity ?? null,
      uom: dto.uom ?? null,
      unitPrice: dto.unitPrice ?? null,
      lineDiscount: dto.lineDiscount ?? null,
      lineDiscountBasis: dto.lineDiscountBasis ?? null,
      leadTimeDays: dto.leadTimeDays ?? null,
      warrantyMonths: dto.warrantyMonths ?? null,
      notes: dto.notes ?? null,
      createdBy: ctx.actorId ?? null,
    });
  }

  /** Coverage of the requirements asked for, plus the supplier's own total IN THEIR OWN CURRENCY. */
  @Permissions('procurement.rfq.read')
  @Get(':id/summary')
  summary(@Param('id', ParseUuidOr404Pipe) id: string, @Query('prLines') prLines?: string) {
    const ids = (prLines ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    return this.lines.summarise(this.tenant.get().tenantId, id, ids);
  }

  @Permissions('procurement.rfq.update')
  @Delete('lines/:lineId')
  async remove(@Param('lineId', ParseUuidOr404Pipe) lineId: string): Promise<{ ok: true }> {
    await this.lines.remove(this.tenant.get().tenantId, lineId);
    return { ok: true };
  }
}
