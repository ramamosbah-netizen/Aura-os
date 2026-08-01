import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantContext } from '@aura/core';
import { HandoverService, type HandoverView } from '@aura/commissioning';

class CreateHandoverDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
}

class ChecklistDto {
  @IsOptional() @IsBoolean() omManuals?: boolean;
  @IsOptional() @IsBoolean() asBuilts?: boolean;
  @IsOptional() @IsBoolean() testCertificates?: boolean;
  @IsOptional() @IsBoolean() warrantyDocs?: boolean;
  @IsOptional() @IsBoolean() training?: boolean;
  @IsOptional() @IsBoolean() spares?: boolean;
}

class AcceptDto {
  @IsString() clientRepresentative!: string;
  @IsOptional() @IsString() warrantyStartDate?: string;
  @IsOptional() @IsInt() @Min(0) warrantyMonths?: number;
}

class RejectDto {
  @IsString() reason!: string;
}

/**
 * Handover API — the project-level acceptance that closes ELV delivery. Compile the close-out
 * checklist, submit to the client, and record acceptance (which starts the warranty clock).
 * Each package carries live commissioning stats for its project. Domain guards throw plain
 * Errors classified by the global taxonomy (404 / 409 / 400) — no 500 leaks.
 */
@Controller('commissioning/handovers')
export class HandoverController {
  constructor(
    private readonly service: HandoverService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateHandoverDto): Promise<HandoverView> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.service.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName ?? null,
      code: dto.code,
      title: dto.title,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(@Query('projectId') projectId?: string): Promise<HandoverView[]> {
    return this.service.list(this.tenant.get().tenantId, projectId);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<HandoverView> {
    const found = await this.service.get(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`handover package ${id} not found`);
    return found;
  }

  @Put(':id/checklist')
  updateChecklist(@Param('id') id: string, @Body() dto: ChecklistDto): Promise<HandoverView> {
    return this.service.updateChecklist(id, this.tenant.get().tenantId, dto);
  }

  @Put(':id/submit')
  submit(@Param('id') id: string): Promise<HandoverView> {
    return this.service.submit(id, this.tenant.get().tenantId);
  }

  @Put(':id/accept')
  accept(@Param('id') id: string, @Body() dto: AcceptDto): Promise<HandoverView> {
    if (!dto?.clientRepresentative?.trim()) throw new BadRequestException('clientRepresentative is required');
    return this.service.accept(id, this.tenant.get().tenantId, {
      clientRepresentative: dto.clientRepresentative,
      warrantyStartDate: dto.warrantyStartDate,
      warrantyMonths: dto.warrantyMonths,
    });
  }

  @Put(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto): Promise<HandoverView> {
    if (!dto?.reason?.trim()) throw new BadRequestException('reason is required');
    return this.service.reject(id, this.tenant.get().tenantId, dto.reason);
  }
}
