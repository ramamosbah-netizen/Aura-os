import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type PurchaseOrder,
  type PurchaseOrderStatus,
  PurchaseOrderService,
  type PurchaseRequest,
  type PurchaseRequestStatus,
  PurchaseRequestService,
} from '@aura/procurement';

interface CreatePurchaseOrderDto {
  title: string;
  reference?: string;
  supplierName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  status?: PurchaseOrderStatus;
  value?: number;
}

interface CreatePurchaseRequestDto {
  title: string;
  reference?: string;
  projectId?: string | null;
  projectName?: string | null;
  status?: PurchaseRequestStatus;
  value?: number;
}

/** Procurement API — stamps tenant/actor from context, delegates to Services. */
@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly pos: PurchaseOrderService,
    private readonly prs: PurchaseRequestService,
    private readonly tenant: TenantContext,
  ) {}

  // ── PURCHASE ORDERS ──────────────────────────────────────────────────────

  @Post('purchase-orders')
  createPo(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
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

  @Get('purchase-orders')
  listPos(@Query('status') status?: string, @Query('projectId') projectId?: string): Promise<PurchaseOrder[]> {
    return this.pos.list({ status, projectId, limit: 100 });
  }

  @Get('purchase-orders/:id')
  async getPo(@Param('id') id: string): Promise<PurchaseOrder> {
    const found = await this.pos.get(id);
    if (!found) throw new NotFoundException(`purchase order ${id} not found`);
    return found;
  }

  @Patch('purchase-orders/:id/status')
  async changePoStatus(
    @Param('id') id: string,
    @Body() dto: { status: PurchaseOrderStatus },
  ): Promise<PurchaseOrder> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const found = await this.pos.get(id);
    if (!found) throw new NotFoundException(`purchase order ${id} not found`);
    return this.pos.changeStatus(id, dto.status);
  }

  // ── PURCHASE REQUESTS ────────────────────────────────────────────────────

  @Post('purchase-requests')
  createPr(@Body() dto: CreatePurchaseRequestDto): Promise<PurchaseRequest> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.prs.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      projectId: dto.projectId ?? null,
      projectName: dto.projectName ?? null,
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get('purchase-requests')
  listPrs(@Query('status') status?: string, @Query('projectId') projectId?: string): Promise<PurchaseRequest[]> {
    const ctx = this.tenant.get();
    return this.prs.list({ tenantId: ctx.tenantId, status, projectId, limit: 100 });
  }

  @Get('purchase-requests/:id')
  async getPr(@Param('id') id: string): Promise<PurchaseRequest> {
    const found = await this.prs.get(id);
    if (!found) throw new NotFoundException(`purchase request ${id} not found`);
    return found;
  }

  @Patch('purchase-requests/:id/status')
  async changePrStatus(
    @Param('id') id: string,
    @Body() dto: { status: PurchaseRequestStatus },
  ): Promise<PurchaseRequest> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const found = await this.prs.get(id);
    if (!found) throw new NotFoundException(`purchase request ${id} not found`);
    const ctx = this.tenant.get();
    return this.prs.changeStatus(id, dto.status, ctx.actorId ?? undefined);
  }
}
