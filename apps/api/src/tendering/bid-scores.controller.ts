import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type BidScore, type BidCriterion, BidScoreService } from '@aura/tendering';

class CreateBidScoreDto {
  @IsString() tenderId!: string;
  @IsOptional() @IsString() tenderTitle?: string;
  @IsArray() criteria!: BidCriterion[];
  @IsOptional() @IsString() notes?: string;
}

/** Tender bid-scoring (go/no-go) API — delegates to BidScoreService. */
@Controller('tendering/bid-scores')
export class BidScoresController {
  constructor(
    private readonly bidScores: BidScoreService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateBidScoreDto): Promise<BidScore> {
    if (!dto?.tenderId) throw new BadRequestException('tenderId is required');
    if (!Array.isArray(dto?.criteria) || dto.criteria.length === 0) throw new BadRequestException('at least one criterion is required');
    const ctx = this.tenant.get();
    return this.bidScores.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      tenderId: dto.tenderId,
      tenderTitle: dto.tenderTitle ?? null,
      criteria: dto.criteria,
      notes: dto.notes ?? null,
      decidedBy: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(
    @Query('tenderId') tenderId?: string,
    @Query('recommendation') recommendation?: string,
  ): Promise<BidScore[]> {
    return this.bidScores.list({ tenantId: this.tenant.get().tenantId, tenderId, recommendation, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('tenderId') tenderId?: string,
    @Query('recommendation') recommendation?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.bidScores.listPaged(
      { tenantId: this.tenant.get().tenantId, tenderId, recommendation },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<BidScore> {
    const found = await this.bidScores.get(id);
    if (!found) throw new NotFoundException(`bid score ${id} not found`);
    return found;
  }
}
