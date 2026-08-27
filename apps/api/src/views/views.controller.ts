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

  /**
   * Tenant-wide views plus the caller's own. A colleague's PRIVATE view is never returned — the
   * filtering is in the query, not in the browser, so knowing the endpoint reveals nothing.
   */
  @Get()
  list(@Query('path') path?: string): Promise<SavedView[]> {
    const ctx = this.tenant.get();
    return this.views.list(ctx.tenantId, ctx.actorId ?? null, path);
  }

  @Post()
  async create(@Body() dto: CreateViewDto): Promise<SavedView> {
    if (!dto?.label?.trim() || !dto?.path?.trim()) throw new BadRequestException('label and path are required');
    const ctx = this.tenant.get();
    return this.views.create({ tenantId: ctx.tenantId, userId: ctx.actorId, label: dto.label, path: dto.path, query: dto.query });
  }

  /** Deletes only a view the caller OWNS. Proven server-side; knowing an id is not authorisation. */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: string }> {
    const ctx = this.tenant.get();
    await this.views.remove(ctx.tenantId, id, ctx.actorId ?? null);
    return { deleted: id };
  }

  /**
   * Toggle the current page as a favourite — a SavedView for this route, not a separate concept.
   * Requires a real identity: a favourite with no owner would be a tenant-wide view by accident.
   */
  @Post('favorite')
  async favorite(@Body() dto: CreateViewDto): Promise<{ favorited: boolean; view: SavedView | null }> {
    if (!dto?.label?.trim() || !dto?.path?.trim()) throw new BadRequestException('label and path are required');
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new BadRequestException('Favouriting a page requires an authenticated user');
    return this.views.favorite({ tenantId: ctx.tenantId, userId: ctx.actorId, label: dto.label, path: dto.path, query: dto.query });
  }
}
