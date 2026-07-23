import { Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import type { EstimationLineInput } from '@aura/shared';
import { PricingSheetService, type PricingSheet } from '@aura/crm';
import { ParseUuidOr404Pipe, TenantContext } from '@aura/core';

class CreateSheetDto {
  @IsString() name!: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsString() quotationId?: string;
  @IsOptional() @IsArray() lines?: EstimationLineInput[];
}

/**
 * PricingSheets — pricing as its own aggregate. The workspace edits a DRAFT sheet; FREEZE commits
 * the build-up (immutable from then on); GENERATE writes the quotation from the frozen sheet — the
 * quote as an output, never the place prices are typed. Re-pricing after freeze = a new version.
 */
@Controller('crm/pricing-sheets')
export class PricingSheetsController {
  constructor(
    private readonly sheets: PricingSheetService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateSheetDto): Promise<PricingSheet> {
    const ctx = this.tenant.get();
    return this.sheets.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      name: dto.name,
      opportunityId: dto.opportunityId ?? null,
      quotationId: dto.quotationId ?? null,
      lines: dto.lines,
      createdBy: ctx.actorId,
    });
  }

  /** Sheets on a deal or behind a quote — newest first, so the working version tops the list. */
  @Get()
  list(@Query('opportunityId') opportunityId?: string, @Query('quotationId') quotationId?: string): Promise<PricingSheet[]> {
    return this.sheets.list({ tenantId: this.tenant.get().tenantId, opportunityId, quotationId, limit: 50 });
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<PricingSheet> {
    const sheet = await this.sheets.get(id);
    if (!sheet || sheet.tenantId !== this.tenant.get().tenantId) throw new NotFoundException('pricing sheet not found');
    return sheet;
  }

  /** Save the draft's lines. The domain refuses on a frozen sheet (409 via the taxonomy). */
  @Put(':id/lines')
  saveLines(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: { lines?: EstimationLineInput[] }): Promise<PricingSheet> {
    return this.sheets.saveLines(id, Array.isArray(dto?.lines) ? dto.lines : []);
  }

  /** Freeze the baseline — the commercial commitment. */
  @Post(':id/freeze')
  freeze(@Param('id', ParseUuidOr404Pipe) id: string): Promise<PricingSheet> {
    return this.sheets.freeze(id, this.tenant.get().actorId);
  }

  /** A new draft version from a frozen sheet. */
  @Post(':id/revise')
  revise(@Param('id', ParseUuidOr404Pipe) id: string): Promise<PricingSheet> {
    return this.sheets.revise(id, this.tenant.get().actorId);
  }

  /** Generate the linked quotation from the FROZEN sheet — refused on a draft. */
  @Post(':id/generate-quotation')
  generate(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ sheet: PricingSheet; quotationId: string }> {
    return this.sheets.generateQuotation(id);
  }
}
