import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type StockItem, type StockMovement, type StockDirection, type ValuationSummary, type ReorderReport, type UomConversion, StockService } from '@aura/inventory';

interface CreateStockItemDto {
  code: string;
  name: string;
  unit?: string;
  barcode?: string;
  altUnits?: UomConversion[];
  warehouse?: string;
  openingQty?: number;
  openingCost?: number;
  costingMethod?: 'wac' | 'fifo';
}

interface MovementDto {
  direction: StockDirection;
  quantity: number;
  reason?: string;
  unitCost?: number;
  /** Optional UOM the quantity (and unitCost) are entered in — converts to base. */
  unit?: string;
}

interface UomDto {
  barcode?: string | null;
  altUnits?: UomConversion[];
}

interface ReorderDto {
  reorderLevel: number;
  reorderQty?: number;
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
      barcode: dto.barcode,
      altUnits: dto.altUnits,
      warehouse: dto.warehouse,
      openingQty: dto.openingQty,
      openingCost: dto.openingCost,
      costingMethod: dto.costingMethod,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  listItems(@Query('warehouse') warehouse?: string): Promise<StockItem[]> {
    const ctx = this.tenant.get();
    return this.stock.listItems({ tenantId: ctx.tenantId, warehouse, limit: 200 });
  }

  // literal routes before `:id`
  @Get('paged')
  pagedItems(
    @Query('warehouse') warehouse?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.stock.listItemsPaged(
      { tenantId: this.tenant.get().tenantId, warehouse },
      parsePageParams(limit, offset),
    );
  }

  @Get('valuation')
  valuation(@Query('warehouse') warehouse?: string): Promise<ValuationSummary> {
    const ctx = this.tenant.get();
    return this.stock.valuation({ tenantId: ctx.tenantId, warehouse, limit: 200 });
  }

  @Get('reorder')
  reorder(@Query('warehouse') warehouse?: string): Promise<ReorderReport> {
    const ctx = this.tenant.get();
    return this.stock.reorderReport({ tenantId: ctx.tenantId, warehouse, limit: 200 });
  }

  /** Scanner flow: barcode → item. */
  @Get('by-barcode/:barcode')
  async byBarcode(@Param('barcode') barcode: string): Promise<StockItem> {
    const found = await this.stock.getItemByBarcode(this.tenant.get().tenantId, barcode);
    if (!found) throw new NotFoundException(`no stock item with barcode ${barcode}`);
    return found;
  }

  @Get(':id')
  async getItem(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ item: StockItem; movements: StockMovement[] }> {
    const found = await this.stock.getItemWithMovements(id);
    if (!found) throw new NotFoundException(`stock item ${id} not found`);
    return found;
  }

  @Get(':id/fifo')
  async fifo(@Param('id', ParseUuidOr404Pipe) id: string) {
    const f = await this.stock.fifoValuation(id);
    if (!f) throw new NotFoundException(`stock item ${id} not found`);
    return f;
  }

  @Post(':id/movements')
  async recordMovement(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: MovementDto,
  ): Promise<{ item: StockItem; movement: StockMovement }> {
    if (dto?.direction !== 'in' && dto?.direction !== 'out') throw new BadRequestException("direction must be 'in' or 'out'");
    if (!(Number(dto.quantity) > 0)) throw new BadRequestException('quantity must be positive');
    try {
      return await this.stock.recordMovement(id, dto.direction, dto.quantity, dto.reason, dto.unitCost, dto.unit);
    } catch (e) {
      // surface domain rejections (e.g. insufficient stock) as a 400 with the real reason
      throw new BadRequestException((e as Error).message);
    }
  }

  @Patch(':id/uom')
  async setUom(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UomDto): Promise<StockItem> {
    if (dto?.barcode === undefined && dto?.altUnits === undefined) {
      throw new BadRequestException('barcode or altUnits is required');
    }
    try {
      return await this.stock.setItemUom(id, { barcode: dto.barcode, altUnits: dto.altUnits });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Patch(':id/reorder')
  async setReorder(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: ReorderDto): Promise<StockItem> {
    if (!(Number(dto?.reorderLevel) >= 0)) throw new BadRequestException('reorderLevel must be zero or positive');
    try {
      return await this.stock.setReorderPolicy(id, dto.reorderLevel, dto.reorderQty ?? 0);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
