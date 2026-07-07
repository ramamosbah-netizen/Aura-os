import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type TenderOutcome, type WinLossAnalytics, WinLossService } from '@aura/tendering';

interface RecordOutcomeDto {
  tenderId: string;
  tenderTitle?: string;
  result: 'won' | 'lost';
  ourBidValue?: number;
  competitors?: Array<{ name: string; bidValue?: number | null; winner?: boolean }>;
  reason?: string;
  decidedAt?: string;
}

/** Tender win/loss (competitor analytics) API — delegates to WinLossService. */
@Controller('tendering/outcomes')
export class WinLossController {
  constructor(
    private readonly winLoss: WinLossService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  async record(@Body() dto: RecordOutcomeDto): Promise<TenderOutcome> {
    if (!dto?.tenderId) throw new BadRequestException('tenderId is required');
    if (dto?.result !== 'won' && dto?.result !== 'lost') throw new BadRequestException("result must be 'won' or 'lost'");
    const ctx = this.tenant.get();
    return await this.winLoss.record({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      tenderId: dto.tenderId,
      tenderTitle: dto.tenderTitle ?? null,
      result: dto.result,
      ourBidValue: dto.ourBidValue,
      competitors: dto.competitors,
      reason: dto.reason ?? null,
      decidedAt: dto.decidedAt,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(
    @Query('tenderId') tenderId?: string,
    @Query('result') result?: string,
  ): Promise<TenderOutcome[]> {
    return this.winLoss.list({ tenantId: this.tenant.get().tenantId, tenderId, result, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('tenderId') tenderId?: string,
    @Query('result') result?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.winLoss.listPaged(
      { tenantId: this.tenant.get().tenantId, tenderId, result },
      parsePageParams(limit, offset),
    );
  }

  @Get('analytics')
  analytics(): Promise<WinLossAnalytics> {
    return this.winLoss.analytics(this.tenant.get().tenantId);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<TenderOutcome> {
    const found = await this.winLoss.get(id);
    if (!found) throw new NotFoundException(`tender outcome ${id} not found`);
    return found;
  }
}
