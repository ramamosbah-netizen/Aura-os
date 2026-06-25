import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type PurchaseOrder, type PurchaseOrderStatus, PurchaseOrderService } from '@aura/procurement';

interface CreatePurchaseOrderDto {
  title: string;
  reference?: string;
  supplierName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  status?: PurchaseOrderStatus;
  value?: number;
}

/** Procurement API — stamps tenant/actor from context, delegates to PurchaseOrderService. */
@Controller('procurement/purchase-orders')
export class ProcurementController {
  constructor(
    private readonly pos: PurchaseOrderService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.pos.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      supplierName: dto.supplierName ?? null,
      projectId: dto.projectId ?? null,
      projectName: dto.projectName ?? null,
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(@Query('status') status?: string, @Query('projectId') projectId?: string): Promise<PurchaseOrder[]> {
    return this.pos.list({ status, projectId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<PurchaseOrder> {
    const found = await this.pos.get(id);
    if (!found) throw new NotFoundException(`purchase order ${id} not found`);
    return found;
  }
}
