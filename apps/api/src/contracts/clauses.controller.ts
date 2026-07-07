import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type ContractClause, type ClauseCategory, ClauseService } from '@aura/contracts';

/** Contract clause library API — reusable tenant-scoped clause templates. */
@Controller('contracts/clauses')
export class ClausesController {
  constructor(
    private readonly clauses: ClauseService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(
    @Body() dto: { code: string; title: string; category?: ClauseCategory; body: string; tags?: string[]; active?: boolean },
  ): Promise<ContractClause> {
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.body?.trim()) throw new BadRequestException('body is required');
    const ctx = this.tenant.get();
    return this.clauses.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      code: dto.code,
      title: dto.title,
      category: dto.category,
      body: dto.body,
      tags: dto.tags,
      active: dto.active,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(
    @Query('category') category?: string,
    @Query('active') active?: string,
  ): Promise<ContractClause[]> {
    return this.clauses.list({
      tenantId: this.tenant.get().tenantId,
      category,
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      limit: 200,
    });
  }

  @Get('paged')
  paged(
    @Query('category') category?: string,
    @Query('active') active?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.clauses.listPaged(
      { tenantId: this.tenant.get().tenantId, category, active: active === 'true' ? true : active === 'false' ? false : undefined },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<ContractClause> {
    const found = await this.clauses.get(id);
    if (!found) throw new NotFoundException(`clause ${id} not found`);
    return found;
  }

  @Patch(':id')
  async revise(
    @Param('id') id: string,
    @Body() dto: { title?: string; body?: string; category?: ClauseCategory; tags?: string[]; active?: boolean },
  ): Promise<ContractClause> {
    return await this.clauses.revise(id, dto ?? {});
  }
}
