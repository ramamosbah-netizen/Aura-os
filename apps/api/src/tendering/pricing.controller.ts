import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { NumberingService, ParseUuidOr404Pipe, SettingsService, TenantContext } from '@aura/core';
import {
  EstimateService,
  TenderService,
  type BOQItem,
  type RateBuildUp,
  type ResourceBreakdown,
  type TenderEstimate,
  type Tender,
} from '@aura/tendering';
import { QuotationService, type NewQuotationLine, type Quotation } from '@aura/crm';

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

  /** Everything the pricing sheet page needs in one fetch. */
  @Get(':id/pricing')
  async pricing(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{
    tender: Tender;
    items: BOQItem[];
    buildUps: Record<string, RateBuildUp>;
    estimate: TenderEstimate | null;
    rates: { technician: number; engineer: number; projectManager: number };
    quotations: Array<Pick<Quotation, 'id' | 'quoteNumber' | 'status' | 'total' | 'issueDate'>>;
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
    return {
      tender,
      items,
      buildUps: Object.fromEntries(buildUps.map((b) => [b.boqItemId, b])),
      estimate,
      rates,
      quotations: generated.map((q) => ({ id: q.id, quoteNumber: q.quoteNumber, status: q.status, total: q.total, issueDate: q.issueDate })),
    };
  }

  /** Save one BOQ item's resource breakdown — compiles to components, prices the line, writes the rate back to the BOQ. */
  @Post(':id/pricing/items/:itemId')
  async priceItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('itemId', ParseUuidOr404Pipe) itemId: string,
    @Body() dto: { resources?: Partial<ResourceBreakdown>; overheadPercent?: number; profitPercent?: number; notes?: string },
  ): Promise<RateBuildUp> {
    await this.tenderOr404(id);
    if (!dto?.resources || typeof dto.resources !== 'object') throw new BadRequestException('resources breakdown is required');
    const ctx = this.tenant.get();
    try {
      return await this.estimates.buildRate(
        {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId ?? null,
          boqItemId: itemId,
          resources: dto.resources as ResourceBreakdown,
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
