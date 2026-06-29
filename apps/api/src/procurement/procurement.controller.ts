import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type PurchaseOrder,
  type PurchaseOrderStatus,
  PurchaseOrderService,
  type PurchaseRequest,
  type PurchaseRequestStatus,
  PurchaseRequestService,
  type Rfq,
  type RfqQuote,
  RfqService,
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

interface CreateRfqDto {
  title: string;
  reference?: string;
  prId?: string | null;
  prTitle?: string | null;
  dueDate?: string | null;
}

interface AddQuoteDto {
  supplierName: string;
  amount: number;
  leadTimeDays?: number | null;
  notes?: string | null;
}

/** Procurement API — stamps tenant/actor from context, delegates to Services. */
@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly pos: PurchaseOrderService,
    private readonly prs: PurchaseRequestService,
    private readonly rfqs: RfqService,
    private readonly tenant: TenantContext,
  ) {}

  // ── PURCHASE ORDERS ──────────────────────────────────────────────────────

  @Post('purchase-orders')
  createPo(@Body() dto: CreatePurchaseOrderDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<PurchaseOrder> {
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
    }, idempotencyKey);
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

  // ── RFQ (Request for Quotation) ──────────────────────────────────────────

  @Post('rfqs')
  createRfq(@Body() dto: CreateRfqDto): Promise<Rfq> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.rfqs.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      prId: dto.prId ?? null,
      prTitle: dto.prTitle ?? null,
      dueDate: dto.dueDate ?? null,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get('rfqs')
  listRfqs(@Query('status') status?: string): Promise<Rfq[]> {
    const ctx = this.tenant.get();
    return this.rfqs.list({ tenantId: ctx.tenantId, status, limit: 100 });
  }

  @Get('rfqs/:id')
  async getRfq(@Param('id') id: string): Promise<{ rfq: Rfq; quotes: RfqQuote[]; recommended: RfqQuote | null }> {
    const found = await this.rfqs.getWithQuotes(id);
    if (!found) throw new NotFoundException(`RFQ ${id} not found`);
    return found;
  }

  @Patch('rfqs/:id/send')
  async sendRfq(@Param('id') id: string): Promise<Rfq> {
    const found = await this.rfqs.get(id);
    if (!found) throw new NotFoundException(`RFQ ${id} not found`);
    return this.rfqs.send(id);
  }

  @Post('rfqs/:id/quotes')
  async addQuote(@Param('id') id: string, @Body() dto: AddQuoteDto): Promise<RfqQuote> {
    if (!dto?.supplierName?.trim()) throw new BadRequestException('supplierName is required');
    if (!(Number(dto.amount) > 0)) throw new BadRequestException('amount must be positive');
    const ctx = this.tenant.get();
    return this.rfqs.addQuote({
      rfqId: id,
      tenantId: ctx.tenantId,
      supplierName: dto.supplierName,
      amount: dto.amount,
      leadTimeDays: dto.leadTimeDays ?? null,
      notes: dto.notes ?? null,
    });
  }

  @Patch('rfqs/:id/award')
  async awardRfq(
    @Param('id') id: string,
    @Body() dto: { quoteId: string },
  ): Promise<{ rfq: Rfq; quotes: RfqQuote[] }> {
    if (!dto?.quoteId) throw new BadRequestException('quoteId is required');
    const ctx = this.tenant.get();
    return this.rfqs.award(id, dto.quoteId, ctx.actorId ?? undefined);
  }
}
