import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type CostComponent, type RateBuildUp, type TenderEstimate, EstimateService } from '@aura/tendering';
import { isQuotationCommitted, QuotationService } from '@aura/crm';

interface BuildRateDto {
  boqItemId: string;
  components: Array<Pick<CostComponent, 'costType' | 'description' | 'quantity' | 'unitCost'>>;
  /** Indirect/preliminaries % on direct cost. */
  indirectPercent?: number;
  overheadPercent?: number;
  /** Risk/contingency % on the full cost base (T3). */
  riskPercent?: number;
  profitPercent?: number;
  notes?: string;
  /** Write the selling rate back onto the BOQ item. */
  applyToBoq?: boolean;
}

/** Tender estimate engine API (rate build-ups + tender estimate) — delegates to EstimateService. */
@Controller('tendering/estimates')
export class EstimatesController {
  constructor(
    private readonly estimates: EstimateService,
    private readonly tenant: TenantContext,
    private readonly quotations: QuotationService,
  ) {}

  @Post()
  async buildRate(@Body() dto: BuildRateDto): Promise<RateBuildUp> {
    if (!dto?.boqItemId) throw new BadRequestException('boqItemId is required');
    if (!Array.isArray(dto?.components) || dto.components.length === 0) {
      throw new BadRequestException('at least one cost component is required');
    }
    const ctx = this.tenant.get();
    // This legacy composition endpoint must obey the same freeze boundary as the canonical
    // pricing workspace. Once a tender-generated quotation is committed, rebuilding a rate here
    // would silently change the cost evidence behind an issued offer. Re-price through a new
    // quotation revision instead.
    const tenderId = await this.estimates.tenderIdForBoqItem(ctx.tenantId, dto.boqItemId);
    if (tenderId) {
      const committed = (await this.quotations.listBySourceTender(ctx.tenantId, tenderId)).filter(isQuotationCommitted);
      if (committed.length > 0) {
        throw new ConflictException('tender estimate is locked by a committed quotation; raise a quotation revision to re-price');
      }
    }
    try {
      return await this.estimates.buildRate(
        {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          boqItemId: dto.boqItemId,
          components: dto.components,
          indirectPercent: dto.indirectPercent,
          overheadPercent: dto.overheadPercent,
          riskPercent: dto.riskPercent,
          profitPercent: dto.profitPercent,
          notes: dto.notes ?? null,
          createdBy: ctx.actorId,
        },
        { applyToBoq: dto.applyToBoq },
      );
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'rate build-up failed');
    }
  }

  @Get()
  list(@Query('tenderId') tenderId?: string): Promise<RateBuildUp[]> {
    if (!tenderId) throw new BadRequestException('tenderId is required');
    return this.estimates.listByTender(this.tenant.get().tenantId, tenderId);
  }

  @Get('summary')
  async summary(@Query('tenderId') tenderId?: string): Promise<TenderEstimate> {
    if (!tenderId) throw new BadRequestException('tenderId is required');
    const est = await this.estimates.tenderEstimate(this.tenant.get().tenantId, tenderId);
    if (!est) throw new NotFoundException(`tender ${tenderId} has no BOQ`);
    return est;
  }

  @Get('boq-item/:boqItemId')
  async forBoqItem(@Param('boqItemId') boqItemId: string): Promise<RateBuildUp> {
    const found = await this.estimates.getForBoqItem(this.tenant.get().tenantId, boqItemId);
    if (!found) throw new NotFoundException(`no rate build-up for BOQ item ${boqItemId}`);
    return found;
  }
}
