import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type Budget, type BudgetVsActual, type NewBudgetLine, BudgetService } from '@aura/finance';

interface CreateBudgetDto {
  name: string;
  from: string; // YYYY-MM-DD
  to: string;
  lines: NewBudgetLine[];
}

/** Finance budgets + budget-vs-actual (actuals folded live from the GL). */
@Controller('finance/budgets')
export class BudgetController {
  constructor(
    private readonly budgets: BudgetService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  list(): Promise<Budget[]> {
    return this.budgets.list(this.tenant.get().tenantId);
  }

  @Get('paged')
  paged(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.budgets.listPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
  }

  @Post()
  async create(@Body() dto: CreateBudgetDto): Promise<Budget> {
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    if (!Array.isArray(dto?.lines) || dto.lines.length === 0) {
      throw new BadRequestException('at least one budget line is required');
    }
    const ctx = this.tenant.get();
    try {
      return await this.budgets.create({
        tenantId: ctx.tenantId,
        name: dto.name,
        from: dto.from,
        to: dto.to,
        lines: dto.lines,
        createdBy: ctx.actorId,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'budget create failed');
    }
  }

  @Get(':id/vs-actual')
  async vsActual(@Param('id', ParseUuidOr404Pipe) id: string): Promise<BudgetVsActual> {
    const result = await this.budgets.vsActual(id);
    if (!result) throw new NotFoundException(`Budget ${id} not found`);
    return result;
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Budget> {
    const found = await this.budgets.get(id);
    if (!found) throw new NotFoundException(`Budget ${id} not found`);
    return found;
  }

  @Delete(':id')
  async remove(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ deleted: string }> {
    await this.budgets.remove(id);
    return { deleted: id };
  }

  @Post(':id/restore')
  async restore(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Budget> {
    await this.budgets.restore(id);
    const restored = await this.budgets.get(id);
    if (!restored) throw new NotFoundException(`Budget ${id} not found`);
    return restored;
  }
}
