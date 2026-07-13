import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams, type Lead, type LeadStatus, type LeadSource } from '@aura/shared';
import { LeadService } from '@aura/crm';

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

@Controller('crm/leads')
export class CrmLeadsController {
  constructor(
    private readonly leads: LeadService,
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
