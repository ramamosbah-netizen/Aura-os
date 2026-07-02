import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { TemplatesService, DocumentTemplate } from './templates.service';

class CreateTemplateDto {
  @IsString() name!: string;
  @IsString() category!: string;
  @IsOptional() @IsArray() elements?: any[];
}

class UpdateTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsArray() elements?: any[];
  @IsOptional() @IsString() status?: string;
}

@Controller('templates')
export class TemplatesController {
  constructor(
    private readonly service: TemplatesService,
    private readonly tenant: TenantContext
  ) {}

  @Post()
  async create(@Body() dto: CreateTemplateDto): Promise<DocumentTemplate> {
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    if (!dto?.category?.trim()) throw new BadRequestException('category is required');

    const ctx = this.tenant.get();
    return this.service.create({
      tenantId: ctx.tenantId,
      name: dto.name,
      category: dto.category,
      elements: dto.elements,
    });
  }

  @Get()
  async list(@Query('category') category?: string): Promise<DocumentTemplate[]> {
    const ctx = this.tenant.get();
    return this.service.list(ctx.tenantId, category);
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<DocumentTemplate> {
    const ctx = this.tenant.get();
    const template = await this.service.get(id, ctx.tenantId);
    if (!template) throw new NotFoundException(`Template with ID ${id} not found`);
    return template;
  }

  @Put(':id')
  async update(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: UpdateTemplateDto
  ): Promise<DocumentTemplate> {
    const ctx = this.tenant.get();
    return this.service.update(id, ctx.tenantId, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ success: boolean }> {
    const ctx = this.tenant.get();
    await this.service.delete(id, ctx.tenantId);
    return { success: true };
  }
}
