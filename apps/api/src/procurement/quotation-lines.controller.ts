import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Permissions, TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { QuotationLineService, type QuotationLine } from '@aura/procurement';

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
  isAlternate?: boolean;
  /** The SUPPLIER'S claim about the specification. Declared so the service can record it as a claim. */
  complianceResponse?: 'comply' | 'comply_with_deviation' | 'not_offered' | null;
  deviations?: string | null;
  exclusions?: string | null;
  quantity?: number | null;
  uom?: string | null;
  unitPrice?: number | null;
  lineDiscount?: number | null;
  leadTimeDays?: number | null;
  warrantyMonths?: number | null;
  notes?: string | null;
}

@Controller('procurement/quotations')
export class QuotationLinesController {
  constructor(
    private readonly lines: QuotationLineService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('procurement.rfq.read')
  @Get(':id/lines')
  list(@Param('id', ParseUuidOr404Pipe) id: string): Promise<QuotationLine[]> {
    return this.lines.listByQuotation(this.tenant.get().tenantId, id);
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

  @Permissions('procurement.rfq.update')
  @Post(':id/lines')
  add(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: QuotationLineDto): Promise<QuotationLine> {
    if (!dto?.prLineId?.trim()) {
      throw new BadRequestException('prLineId is required — a quotation line must answer a requisition line');
    }
    const ctx = this.tenant.get();
    return this.lines.add(ctx.tenantId, {
      quotationId: id,
      prLineId: dto.prLineId,
      response: dto.response,
      offeredManufacturer: dto.offeredManufacturer ?? null,
      offeredModel: dto.offeredModel ?? null,
      isAlternate: dto.isAlternate ?? false,
      complianceResponse: dto.complianceResponse ?? null,
      deviations: dto.deviations ?? null,
      exclusions: dto.exclusions ?? null,
      quantity: dto.quantity ?? null,
      uom: dto.uom ?? null,
      unitPrice: dto.unitPrice ?? null,
      lineDiscount: dto.lineDiscount ?? null,
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
