import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import {
  MARKET_ITEM_CATEGORIES,
  MarketItemService,
  type MarketItem,
  type MarketItemCategory,
} from '@aura/market-intelligence';
import { ParseUuidOr404Pipe, TenantContext } from '@aura/core';

class CreateMarketItemDto {
  @IsString() name!: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsIn(MARKET_ITEM_CATEGORIES as readonly string[]) category?: MarketItemCategory;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) benchmarkCost?: number;
  @IsOptional() @IsNumber() @Min(0) benchmarkSell?: number;
  @IsOptional() @IsNumber() @Min(0) installHours?: number;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() asOf?: string;
  @IsOptional() @IsString() notes?: string;
}

/**
 * Market Intelligence — the reference catalogue behind pricing. An estimator searches it while
 * building a pricing sheet; the suggested cost, price and labour come from here so a fair number
 * is the default instead of a guess. Benchmarks, not a customer price list — each carries a source
 * and an as-of date.
 */
@Controller('crm/market-items')
export class MarketIntelligenceController {
  constructor(
    private readonly items: MarketItemService,
    private readonly tenant: TenantContext,
  ) {}

  /** Search the catalogue — by name/brand text and/or category. This is what the sheet picker calls. */
  @Get()
  list(
    @Query('q') q?: string,
    @Query('category') category?: MarketItemCategory,
    @Query('limit') limit?: string,
  ): Promise<MarketItem[]> {
    return this.items.list({
      tenantId: this.tenant.get().tenantId,
      q,
      category: MARKET_ITEM_CATEGORIES.includes(category as MarketItemCategory) ? category : undefined,
      limit: limit ? Math.min(Number(limit) || 50, 200) : 50,
    });
  }

  /** Seed the starter ELV catalogue. Idempotent — returns how many were added (0 if already seeded). */
  @Post('seed')
  async seed(): Promise<{ added: number }> {
    const ctx = this.tenant.get();
    return { added: await this.items.seed(ctx.tenantId, ctx.actorId) };
  }

  @Post()
  create(@Body() dto: CreateMarketItemDto): Promise<MarketItem> {
    return this.items.create({ ...dto, tenantId: this.tenant.get().tenantId, createdBy: this.tenant.get().actorId });
  }

  @Delete(':id')
  async remove(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ removed: boolean }> {
    const removed = await this.items.remove(id);
    if (!removed) throw new NotFoundException('market item not found');
    return { removed };
  }
}
