import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type StockTransfer, TransferService } from '@aura/inventory';

interface CreateTransferDto {
  sourceItemId: string;
  destItemId: string;
  quantity: number;
  reason?: string;
}

@Controller('inventory/transfers')
export class TransferController {
  constructor(
    private readonly transfers: TransferService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  async create(@Body() dto: CreateTransferDto): Promise<StockTransfer> {
    if (!dto?.sourceItemId || !dto?.destItemId) throw new BadRequestException('sourceItemId and destItemId required');
    if (!(Number(dto.quantity) > 0)) throw new BadRequestException('quantity must be positive');
    const ctx = this.tenant.get();
    try {
      return await this.transfers.execute({
        tenantId: ctx.tenantId,
        sourceItemId: dto.sourceItemId,
        destItemId: dto.destItemId,
        quantity: dto.quantity,
        reason: dto.reason,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get()
  list(): Promise<StockTransfer[]> {
    const ctx = this.tenant.get();
    return this.transfers.list({ tenantId: ctx.tenantId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<StockTransfer> {
    const found = await this.transfers.get(id);
    if (!found) throw new NotFoundException(`transfer ${id} not found`);
    return found;
  }
}
