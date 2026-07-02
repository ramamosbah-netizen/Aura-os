import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type CostComponent, type RateBuildUp, type TenderEstimate, EstimateService } from '@aura/tendering';

interface BuildRateDto {
  boqItemId: string;
  components: Array<Pick<CostComponent, 'costType' | 'description' | 'quantity' | 'unitCost'>>;
  overheadPercent?: number;
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
  ) {}

  @Post()
  async buildRate(@Body() dto: BuildRateDto): Promise<RateBuildUp> {
    if (!dto?.boqItemId) throw new BadRequestException('boqItemId is required');
    if (!Array.isArray(dto?.components) || dto.components.length === 0) {
      throw new BadRequestException('at least one cost component is required');
    }
    const ctx = this.tenant.get();
    try {
      return await this.estimates.buildRate(
        {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          boqItemId: dto.boqItemId,
          components: dto.components,
          overheadPercent: dto.overheadPercent,
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
