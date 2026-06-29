import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type GoodsReceipt, type GoodsReceiptStatus, GoodsReceiptService } from '@aura/inventory';

interface CreateGoodsReceiptDto {
  title: string;
  reference?: string;
  poId?: string | null;
  poTitle?: string | null;
  supplierName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  status?: GoodsReceiptStatus;
  value?: number;
}

/** Inventory API — stamps tenant/actor from context, delegates to GoodsReceiptService. */
@Controller('inventory/grns')
export class InventoryController {
  constructor(
    private readonly grns: GoodsReceiptService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateGoodsReceiptDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<GoodsReceipt> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.grns.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      poId: dto.poId ?? null,
      poTitle: dto.poTitle ?? null,
      supplierName: dto.supplierName ?? null,
      projectId: dto.projectId ?? null,
      projectName: dto.projectName ?? null,
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    }, idempotencyKey);
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('poId') poId?: string,
    @Query('projectId') projectId?: string,
  ): Promise<GoodsReceipt[]> {
    return this.grns.list({ status, poId, projectId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<GoodsReceipt> {
    const found = await this.grns.get(id);
    if (!found) throw new NotFoundException(`goods receipt ${id} not found`);
    return found;
  }
}
