import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type StockItem, type StockMovement, type StockDirection, StockService } from '@aura/inventory';

interface CreateStockItemDto {
  code: string;
  name: string;
  unit?: string;
  warehouse?: string;
  openingQty?: number;
}

interface MovementDto {
  direction: StockDirection;
  quantity: number;
  reason?: string;
}

/** Inventory stock API — items + on-hand movements. */
@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly stock: StockService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  createItem(@Body() dto: CreateStockItemDto): Promise<StockItem> {
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
    return this.stock.createItem({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      code: dto.code,
      name: dto.name,
      unit: dto.unit,
      warehouse: dto.warehouse,
      openingQty: dto.openingQty,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  listItems(@Query('warehouse') warehouse?: string): Promise<StockItem[]> {
    const ctx = this.tenant.get();
    return this.stock.listItems({ tenantId: ctx.tenantId, warehouse, limit: 200 });
  }

  @Get(':id')
  async getItem(@Param('id') id: string): Promise<{ item: StockItem; movements: StockMovement[] }> {
    const found = await this.stock.getItemWithMovements(id);
    if (!found) throw new NotFoundException(`stock item ${id} not found`);
    return found;
  }

  @Post(':id/movements')
  async recordMovement(
    @Param('id') id: string,
    @Body() dto: MovementDto,
  ): Promise<{ item: StockItem; movement: StockMovement }> {
    if (dto?.direction !== 'in' && dto?.direction !== 'out') throw new BadRequestException("direction must be 'in' or 'out'");
    if (!(Number(dto.quantity) > 0)) throw new BadRequestException('quantity must be positive');
    try {
      return await this.stock.recordMovement(id, dto.direction, dto.quantity, dto.reason);
    } catch (e) {
      // surface domain rejections (e.g. insufficient stock) as a 400 with the real reason
      throw new BadRequestException((e as Error).message);
    }
  }
}
