import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import {
  parsePageParams, assessLeadQualification,
  type Lead, type LeadStatus, type LeadSource, type OpportunityStage, type LeadQualificationAssessment,
} from '@aura/shared';
import { LeadService, LeadConversionService, type ConvertLeadResult, type ConvertPreview } from '@aura/crm';

class CreateLeadDto {
  @IsString() name!: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() status?: LeadStatus;
  @IsOptional() @IsString() source?: LeadSource;
}

class UpdateLeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() status?: LeadStatus;
  @IsOptional() @IsString() source?: LeadSource;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() firstRespondedAt?: string;
  @IsOptional() @IsInt() slaFirstResponseHours?: number;
  @IsOptional() @IsString() nextActivityDue?: string;
}

class AssignLeadDto {
  @IsString() assignedTo!: string;
}

class AssessLeadDto {
  /** Partial map of the eight 0–100 dimensions; unknown keys are dropped by the domain
   * normalizer, and an explicit null clears a dimension back to unrated. */
  @IsOptional() @IsObject() dimensions?: Record<string, number | null>;
  @IsOptional() @IsString() notes?: string;
}

class ConvertLeadDto {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsBoolean() createNewAccount?: boolean;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsBoolean() createNewContact?: boolean;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsInt() value?: number;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsBoolean() requiresTender?: boolean;
  @IsOptional() @IsString() closeDate?: string;
  @IsOptional() @IsString() ownerId?: string;
}

@Controller('crm/leads')
export class CrmLeadsController {
  constructor(
    private readonly leads: LeadService,
    private readonly conversion: LeadConversionService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateLeadDto): Promise<Lead> {
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
    return this.leads.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      name: dto.name,
      companyName: dto.companyName,
      email: dto.email,
      phone: dto.phone,
      status: dto.status,
      source: dto.source,
      actorId: ctx.actorId,
    });
  }

  @Patch(':id')
  update(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateLeadDto): Promise<Lead> {
    const ctx = this.tenant.get();
    return this.leads.update(id, dto, ctx.actorId);
  }

  @Patch(':id/assign')
  assign(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AssignLeadDto): Promise<Lead> {
    if (!dto?.assignedTo?.trim()) throw new BadRequestException('assignedTo is required');
    const ctx = this.tenant.get();
    return this.leads.assign(id, dto.assignedTo, ctx.actorId);
  }

  /**
   * G3 — record the qualification assessment and get the verdict back.
   * Dimensions merge (qualification is learned piecemeal); the engine recommends, it never
   * changes status — qualifying stays a human act via PATCH :id { status }.
   */
  @Patch(':id/qualification')
  assess(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: AssessLeadDto,
  ): Promise<{ lead: Lead; assessment: LeadQualificationAssessment }> {
    const ctx = this.tenant.get();
    return this.leads.assess(id, { dimensions: dto?.dimensions, notes: dto?.notes }, ctx.actorId);
  }

  /** The current verdict — derived from the stored dimensions, never a cached score. */
  @Get(':id/qualification')
  async qualification(
    @Param('id', ParseUuidOr404Pipe) id: string,
  ): Promise<{ dimensions: Record<string, number>; notes: string | null; assessedAt: string | null; assessedBy: string | null; assessment: LeadQualificationAssessment }> {
    const lead = await this.leads.get(id);
    if (!lead) throw new NotFoundException(`lead ${id} not found`);
    return {
      dimensions: (lead.qualificationDimensions ?? {}) as Record<string, number>,
      notes: lead.qualificationNotes,
      assessedAt: lead.qualificationAssessedAt,
      assessedBy: lead.qualificationAssessedBy,
      assessment: assessLeadQualification(lead.qualificationDimensions ?? {}),
    };
  }

  /** Dry run — which Account/Contact would convert link vs. create (possible-duplicate check). */
  @Get(':id/convert-preview')
  convertPreview(@Param('id', ParseUuidOr404Pipe) id: string): Promise<ConvertPreview> {
    return this.conversion.preview(id);
  }

  /** Qualify & Convert — transactional, idempotent, dedupe-protected Lead → Opportunity. */
  @Post(':id/convert')
  convert(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: ConvertLeadDto): Promise<ConvertLeadResult> {
    const ctx = this.tenant.get();
    const { title, value, stage, requiresTender, closeDate, ownerId, ...rest } = dto ?? {};
    return this.conversion.convert(id, {
      ...rest,
      actorId: ctx.actorId,
      opportunity: { title, value, stage: stage as OpportunityStage | undefined, requiresTender, closeDate, ownerId },
    });
  }

  @Get()
  list(@Query('status') status?: LeadStatus): Promise<Lead[]> {
    const ctx = this.tenant.get();
    return this.leads.list({ tenantId: ctx.tenantId, status, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('status') status?: LeadStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.leads.listPaged(
      { tenantId: this.tenant.get().tenantId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Lead> {
    const found = await this.leads.get(id);
    if (!found) throw new NotFoundException(`Lead ${id} not found`);
    return found;
  }
}
