import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ApprovalMatrixService, type ApprovalRule } from '@aura/core';
import { parsePageParams, type Discipline } from '@aura/shared';
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
  type Supplier,
  type SupplierCategory,
  SupplierService,
} from '@aura/procurement';

class CreatePurchaseOrderDto {
  @IsString() title!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() supplierId?: string | null;
  @IsOptional() @IsString() supplierName?: string | null;
  @IsOptional() @IsString() projectId?: string | null;
  @IsOptional() @IsString() projectName?: string | null;
  @IsOptional() @IsString() discipline?: Discipline;
  @IsOptional() @IsString() status?: PurchaseOrderStatus;
  @IsOptional() @IsNumber() value?: number;
}

class UpdatePurchaseOrderDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() supplierName?: string;
}

class CreatePurchaseRequestDto {
  @IsString() title!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() projectId?: string | null;
  @IsOptional() @IsString() projectName?: string | null;
  @IsOptional() @IsString() discipline?: Discipline;
  @IsOptional() @IsString() status?: PurchaseRequestStatus;
  @IsOptional() @IsNumber() value?: number;
}

class CreateRfqDto {
  @IsString() title!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() prId?: string | null;
  @IsOptional() @IsString() prTitle?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
}

class AddQuoteDto {
  @IsString() supplierName!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsNumber() leadTimeDays?: number | null;
  @IsOptional() @IsString() notes?: string | null;
}

/** Procurement API — stamps tenant/actor from context, delegates to Services. */
@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly pos: PurchaseOrderService,
    private readonly prs: PurchaseRequestService,
    private readonly rfqs: RfqService,
    private readonly suppliers: SupplierService,
    private readonly approvalMatrix: ApprovalMatrixService,
    private readonly tenant: TenantContext,
  ) {}

  // ── APPROVAL MATRIX ──────────────────────────────────────────────────────

  @Post('approval-matrix')
  async configureApprovalMatrix(@Body() dto: { entityType?: string; rules: ApprovalRule[] }): Promise<{ ok: true }> {
    if (!Array.isArray(dto?.rules)) throw new BadRequestException('rules array is required');
    const ctx = this.tenant.get();
    await this.approvalMatrix.configure({ tenantId: ctx.tenantId, entityType: dto.entityType?.trim() || 'purchase-request', rules: dto.rules });
    return { ok: true };
  }

  // ── PURCHASE ORDERS ──────────────────────────────────────────────────────

  @Post('purchase-orders')
  async createPo(@Body() dto: CreatePurchaseOrderDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<PurchaseOrder> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    try {
      return await this.pos.create({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        title: dto.title,
        reference: dto.reference,
        supplierId: dto.supplierId ?? null,
        supplierName: dto.supplierName ?? null,
        projectId: dto.projectId ?? null,
        projectName: dto.projectName ?? null,
        discipline: dto.discipline,
        status: dto.status,
        value: dto.value,
        ownerId: ctx.actorId,
        createdBy: ctx.actorId,
      }, idempotencyKey);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('purchase-orders')
  listPos(
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('discipline') discipline?: string,
  ): Promise<PurchaseOrder[]> {
    return this.pos.list({ status, projectId, discipline, limit: 100 });
  }

  @Get('purchase-orders/paged')
  pagedPos(
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.pos.listPaged(
      { tenantId: this.tenant.get().tenantId, status, projectId },
      parsePageParams(limit, offset),
    );
  }

  /** PATCH /purchase-orders/:id — update descriptive fields (value is fixed after creation). */
  @Patch('purchase-orders/:id')
  async updatePo(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto): Promise<PurchaseOrder> {
    try {
      return await this.pos.update(id, {
        title: dto.title,
        reference: dto.reference,
        supplierId: dto.supplierId,
        supplierName: dto.supplierName,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
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
    try {
      return await this.pos.changeStatus(id, dto.status);
    } catch (e) {
      throw new BadRequestException((e as Error).message); // e.g. approval gate
    }
  }

  @Post('purchase-orders/:id/submit')
  async submitPo(@Param('id') id: string): Promise<PurchaseOrder> {
    try {
      return await this.pos.submitForApproval(id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('purchase-orders/:id/approve')
  async approvePo(@Param('id') id: string, @Body() dto: { approverLevel?: number }): Promise<PurchaseOrder> {
    if (!(Number(dto?.approverLevel) >= 1)) throw new BadRequestException('approverLevel (>=1) is required');
    try {
      return await this.pos.approve(id, Number(dto.approverLevel));
    } catch (e) {
      throw new BadRequestException((e as Error).message); // under-level approval
    }
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
      discipline: dto.discipline,
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get('purchase-requests')
  listPrs(
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('discipline') discipline?: string,
  ): Promise<PurchaseRequest[]> {
    const ctx = this.tenant.get();
    return this.prs.list({ tenantId: ctx.tenantId, status, projectId, discipline, limit: 100 });
  }

  @Get('purchase-requests/paged')
  pagedPrs(
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.prs.listPaged(
      { tenantId: this.tenant.get().tenantId, status, projectId },
      parsePageParams(limit, offset),
    );
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
    try {
      return await this.prs.changeStatus(id, dto.status, ctx.actorId ?? undefined);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
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

  @Get('rfqs/paged')
  pagedRfqs(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.rfqs.listPaged(
      { tenantId: this.tenant.get().tenantId, status },
      parsePageParams(limit, offset),
    );
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

  // ── SUPPLIER MASTER ──────────────────────────────────────────────────────

  @Post('suppliers')
  async createSupplier(
    @Body() dto: { code: string; name: string; category?: SupplierCategory; tradeLicense?: string; trn?: string; contactName?: string; email?: string; phone?: string },
  ): Promise<Supplier> {
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
    try {
      return await this.suppliers.create({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        code: dto.code,
        name: dto.name,
        category: dto.category,
        tradeLicense: dto.tradeLicense ?? null,
        trn: dto.trn ?? null,
        contactName: dto.contactName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        createdBy: ctx.actorId,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('suppliers')
  listSuppliers(@Query('status') status?: Supplier['status'], @Query('category') category?: SupplierCategory): Promise<Supplier[]> {
    return this.suppliers.list({ tenantId: this.tenant.get().tenantId, status, category, limit: 200 });
  }

  @Get('suppliers/paged')
  pagedSuppliers(
    @Query('status') status?: Supplier['status'],
    @Query('category') category?: SupplierCategory,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.suppliers.listPaged(
      { tenantId: this.tenant.get().tenantId, status, category },
      parsePageParams(limit, offset),
    );
  }

  @Get('suppliers/:id')
  async getSupplier(@Param('id') id: string): Promise<Supplier> {
    const found = await this.suppliers.get(id);
    if (!found) throw new NotFoundException(`supplier ${id} not found`);
    return found;
  }

  @Patch('suppliers/:id/status')
  async changeSupplierStatus(@Param('id') id: string, @Body() dto: { action: 'approve' | 'suspend' }): Promise<Supplier> {
    if (dto?.action !== 'approve' && dto?.action !== 'suspend') throw new BadRequestException("action must be 'approve' or 'suspend'");
    try {
      return await this.suppliers.changeStatus(id, dto.action);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
