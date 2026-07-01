import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { TenantContext, type SavedView, SavedViewService } from '@aura/core';

interface CreateViewDto { label: string; path: string; query?: string }

/** Saved views — named per-tenant list filters (path + querystring). */
@Controller('views')
export class ViewsController {
  constructor(
    private readonly views: SavedViewService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  list(@Query('path') path?: string): Promise<SavedView[]> {
    return this.views.list(this.tenant.get().tenantId, path);
  }

  @Post()
  async create(@Body() dto: CreateViewDto): Promise<SavedView> {
    if (!dto?.label?.trim() || !dto?.path?.trim()) throw new BadRequestException('label and path are required');
    const ctx = this.tenant.get();
    return this.views.create({ tenantId: ctx.tenantId, userId: ctx.actorId, label: dto.label, path: dto.path, query: dto.query });
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: string }> {
    await this.views.remove(this.tenant.get().tenantId, id);
    return { deleted: id };
  }
}
