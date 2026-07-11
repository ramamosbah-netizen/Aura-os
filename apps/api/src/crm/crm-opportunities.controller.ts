import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams, type Opportunity, type OpportunityStage } from '@aura/shared';
import { type Quotation, OpportunityService, QuotationService } from '@aura/crm';

/** The create drawer posts select values as strings — accept both. */
function coerceBool(v: boolean | string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v === true || v === 'true';
}

class CreateOpportunityDto {
  @IsString() title!: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() stage?: OpportunityStage;
  @IsOptional() @IsNumber() winProbability?: number;
  @IsOptional() @IsString() closeDate?: string;
  @IsOptional() requiresTender?: boolean | string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() nextAction?: string;
}

class UpdateOpportunityDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() stage?: OpportunityStage;
  @IsOptional() @IsNumber() winProbability?: number;
  @IsOptional() @IsString() closeDate?: string;
  @IsOptional() requiresTender?: boolean | string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() nextAction?: string;
}

@Controller('crm/opportunities')
export class CrmOpportunitiesController {
  constructor(
    private readonly opportunities: OpportunityService,
    private readonly quotations: QuotationService,
    private readonly tenant: TenantContext,
  ) {}

  /** One-click convert a won opportunity into a draft quotation (carries value + account). */
  @Post(':id/convert-to-quotation')
  async convertToQuotation(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Quotation> {
    const opp = await this.opportunities.get(id);
    if (!opp) throw new NotFoundException(`opportunity ${id} not found`);
    if (opp.stage !== 'won') throw new BadRequestException(`opportunity must be 'won' to convert (is '${opp.stage}')`);
    const ctx = this.tenant.get();
    return this.quotations.create({
      tenantId: ctx.tenantId,
      companyId: opp.companyId,
      quoteNumber: `QT-OPP-${opp.id.slice(0, 8)}`,
      customerName: opp.accountName ?? 'Client',
      accountId: opp.accountId,
      sourceOpportunityId: opp.id,
      ownerId: opp.ownerId ?? null,
      issueDate: new Date().toISOString().slice(0, 10),
      lines: [{ description: opp.title, quantity: 1, unitPrice: opp.value, vatRate: 5 }],
      createdBy: ctx.actorId,
    });
  }

  @Post()
  create(@Body() dto: CreateOpportunityDto): Promise<Opportunity> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.opportunities.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      leadId: dto.leadId,
      accountId: dto.accountId,
      accountName: dto.accountName,
      title: dto.title,
      value: dto.value,
      stage: dto.stage,
      winProbability: dto.winProbability,
      closeDate: dto.closeDate,
      requiresTender: coerceBool(dto.requiresTender),
      ownerId: dto.ownerId,
      nextAction: dto.nextAction,
      actorId: ctx.actorId,
    });
  }

  @Patch(':id')
  update(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateOpportunityDto): Promise<Opportunity> {
    const ctx = this.tenant.get();
    const patch = { ...dto, ...(dto.requiresTender !== undefined ? { requiresTender: coerceBool(dto.requiresTender) } : {}) };
    return this.opportunities.update(id, patch as Parameters<typeof this.opportunities.update>[1], ctx.actorId);
  }

  @Post(':id/forecast')
  forecast(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ winProbability: number; reason: string }> {
    return this.opportunities.forecastWinProbability(id);
  }

  @Get()
  list(@Query('stage') stage?: OpportunityStage, @Query('leadId') leadId?: string): Promise<Opportunity[]> {
    const ctx = this.tenant.get();
    return this.opportunities.list({ tenantId: ctx.tenantId, stage, leadId, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('stage') stage?: OpportunityStage,
    @Query('leadId') leadId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.opportunities.listPaged(
      { tenantId: this.tenant.get().tenantId, stage, leadId },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Opportunity> {
    const found = await this.opportunities.get(id);
    if (!found) throw new NotFoundException(`Opportunity ${id} not found`);
    return found;
  }
}
