import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type Opportunity, type OpportunityStage } from '@aura/shared';
import { OpportunityService } from '@aura/crm';

interface CreateOpportunityDto {
  title: string;
  leadId?: string;
  value?: number;
  stage?: OpportunityStage;
  winProbability?: number;
  closeDate?: string;
}

interface UpdateOpportunityDto {
  title?: string;
  value?: number;
  stage?: OpportunityStage;
  winProbability?: number;
  closeDate?: string;
}

@Controller('crm/opportunities')
export class CrmOpportunitiesController {
  constructor(
    private readonly opportunities: OpportunityService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateOpportunityDto): Promise<Opportunity> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.opportunities.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      leadId: dto.leadId,
      title: dto.title,
      value: dto.value,
      stage: dto.stage,
      winProbability: dto.winProbability,
      closeDate: dto.closeDate,
      actorId: ctx.actorId,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto): Promise<Opportunity> {
    const ctx = this.tenant.get();
    return this.opportunities.update(id, dto, ctx.actorId);
  }

  @Post(':id/forecast')
  forecast(@Param('id') id: string): Promise<{ winProbability: number; reason: string }> {
    return this.opportunities.forecastWinProbability(id);
  }

  @Get()
  list(@Query('stage') stage?: OpportunityStage, @Query('leadId') leadId?: string): Promise<Opportunity[]> {
    const ctx = this.tenant.get();
    return this.opportunities.list({ tenantId: ctx.tenantId, stage, leadId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Opportunity> {
    const found = await this.opportunities.get(id);
    if (!found) throw new NotFoundException(`Opportunity ${id} not found`);
    return found;
  }
}
