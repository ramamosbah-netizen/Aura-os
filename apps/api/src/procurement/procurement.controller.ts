import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, IsIn } from 'class-validator';
import { TenantContext, ApprovalMatrixService, Permissions, type ApprovalRule } from '@aura/core';
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
  @IsOptional() @IsString() cbsNodeId?: string | null;
  @IsOptional() @IsString() boqItemId?: string | null;
  @IsOptional() @IsNumber() orderedQuantity?: number | null;
  @IsOptional() @IsString() unit?: string | null;
  @IsOptional() @IsString() discipline?: Discipline;
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

/**
 * A supplier's offer, and the TERMS IT WAS GIVEN UNDER.
 *
 * `amount` alone cannot support a decision: a price means nothing without the currency it is in,
 * whether tax sits inside or outside it, what freight was quoted separately, how long the offer
 * stands and on what payment terms. Every one of these is DECLARED here rather than left out —
 * the global whitelist pipe strips an undeclared field, so an offer sent in USD would have been
 * accepted with a 201 and silently stored with no currency at all.
 *
 * All optional, and NULL means UNKNOWN. None of them defaults to a convenient assumption.
 */
class AddQuoteDto {
  @IsString() supplierName!: string;
  @IsOptional() @IsString() supplierId?: string | null;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() currency?: string | null;
  @IsOptional() @IsIn(['exclusive', 'inclusive', 'exempt']) taxTreatment?: 'exclusive' | 'inclusive' | 'exempt' | null;
  @IsOptional() @IsNumber() taxRatePct?: number | null;
  @IsOptional() @IsNumber() freightAmount?: number | null;
  @IsOptional() @IsString() freightTerms?: string | null;
  @IsOptional() @IsString() paymentTerms?: string | null;
  @IsOptional() @IsString() validityDate?: string | null;
  /**
   * SUPERSEDED — lead time is a per-item fact and belongs on the quotation LINE.
   *
   * Still DECLARED so it can be REFUSED with a message that says where it goes. Dropping it from the
   * DTO would let the whitelist pipe strip it silently: the caller would get a 201 and believe the
   * lead time had been recorded.
   */
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

  @Permissions('procurement.config.manage')
  @Post('approval-matrix')
  async configureApprovalMatrix(@Body() dto: { entityType?: string; rules: ApprovalRule[] }): Promise<{ ok: true }> {
    if (!Array.isArray(dto?.rules)) throw new BadRequestException('rules array is required');
    const ctx = this.tenant.get();
    await this.approvalMatrix.configure({ tenantId: ctx.tenantId, entityType: dto.entityType?.trim() || 'purchase-request', rules: dto.rules });
    return { ok: true };
  }

  // ── PURCHASE ORDERS ──────────────────────────────────────────────────────

  @Permissions('procurement.po.create')
  @Post('purchase-orders')
  async createPo(@Body() dto: CreatePurchaseOrderDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<PurchaseOrder> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return await this.pos.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      supplierId: dto.supplierId ?? null,
      supplierName: dto.supplierName ?? null,
      projectId: dto.projectId ?? null,
      projectName: dto.projectName ?? null,
      cbsNodeId: dto.cbsNodeId ?? null,
      boqItemId: dto.boqItemId ?? null,
      orderedQuantity: dto.orderedQuantity ?? null,
      unit: dto.unit ?? null,
      discipline: dto.discipline,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    }, idempotencyKey);
  }

  @Permissions('procurement.po.view')
  @Get('purchase-orders')
  listPos(
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('discipline') discipline?: string,
  ): Promise<PurchaseOrder[]> {
    return this.pos.list({ status, projectId, discipline, limit: 100 });
  }

  @Permissions('procurement.po.view')
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
  @Permissions('procurement.po.update')
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

  @Permissions('procurement.po.view')
  @Get('purchase-orders/:id')
  async getPo(@Param('id') id: string): Promise<PurchaseOrder> {
    const found = await this.pos.get(id);
    if (!found) throw new NotFoundException(`purchase order ${id} not found`);
    return found;
  }

  /**
   * THE GENERIC STATUS ROUTE, REFUSED (J3-01).
   *
   * It carried `procurement.po.update` and accepted four statuses, which is how a Buyer holding only
   * update could issue an order to a supplier, cancel a Director-approved one — reversing its
   * committed cost — and close it. The record said "can set status=approved"; refusing that one
   * string left every other transition exactly where it was.
   *
   * It refuses rather than disappearing so a caller still pointing here is told where each act went.
   * The permission stays `update` deliberately: this route can no longer do anything, and widening
   * it would suggest it still could.
   */
  @Permissions('procurement.po.update')
  @Patch('purchase-orders/:id/status')
  changePoStatus(): never {
    throw new BadRequestException(
      'a purchase order\'s status cannot be set directly — each step is its own governed act with its ' +
      'own authority: POST purchase-orders/:id/submit, /approve, /issue, /cancel or /close',
    );
  }

  /**
   * ISSUE — the commitment goes out to the supplier. Its own permission, because sending an order is
   * not editing one: `procurement.po.issue` is held by the Procurement Manager and NOT by the Buyer,
   * who prepares orders without committing them.
   */
  @Permissions('procurement.po.issue')
  @Post('purchase-orders/:id/issue')
  async issuePo(@Param('id') id: string): Promise<PurchaseOrder> {
    const found = await this.pos.get(id);
    if (!found) throw new NotFoundException(`purchase order ${id} not found`);
    return this.pos.issue(id, this.tenant.get().actorId ?? null);
  }

  /**
   * CANCEL — undoing a commitment. A reason is required, and the service additionally checks the
   * approval authority on WHAT IS BEING REVERSED, so cancelling the remainder of a large order asks
   * for the authority that remainder deserves rather than the one its face value would imply.
   */
  @Permissions('procurement.po.cancel')
  @Post('purchase-orders/:id/cancel')
  async cancelPo(@Param('id') id: string, @Body() dto: { reason?: string }): Promise<PurchaseOrder> {
    const found = await this.pos.get(id);
    if (!found) throw new NotFoundException(`purchase order ${id} not found`);
    if (!dto?.reason?.trim()) {
      throw new BadRequestException('cancelling a purchase order must record why — it reverses a commitment somebody approved');
    }
    return this.pos.cancel(id, { actorId: this.tenant.get().actorId ?? null, reason: dto.reason });
  }

  /**
   * CLOSE — operational completion, and deliberately NOT governed like a cancellation. It asks
   * whether the order is finished, not whether somebody may undo it, so it carries its own
   * permission and no approval-authority check.
   */
  @Permissions('procurement.po.close')
  @Post('purchase-orders/:id/close')
  async closePo(@Param('id') id: string): Promise<PurchaseOrder> {
    const found = await this.pos.get(id);
    if (!found) throw new NotFoundException(`purchase order ${id} not found`);
    return this.pos.close(id, this.tenant.get().actorId ?? null);
  }

  @Permissions('procurement.po.submit')
  @Post('purchase-orders/:id/submit')
  async submitPo(@Param('id') id: string): Promise<PurchaseOrder> {
    return await this.pos.submitForApproval(id);
  }

  @Permissions('procurement.po.approve')
  @Post('purchase-orders/:id/approve')
  async approvePo(@Param('id') id: string, @Body() dto: { approverLevel?: number }): Promise<PurchaseOrder> {
    if (!(Number(dto?.approverLevel) >= 1)) throw new BadRequestException('approverLevel (>=1) is required');
    return this.pos.approve(id, Number(dto.approverLevel));
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

  /**
   * EXPLICIT, because route derivation reads the trailing segment and would require
   * `procurement.purchase-request.status` — an action word no shipped procurement role grants, so
   * a Buyer could not move their own requisition at all.
   *
   * `update` is the floor: sending a requisition for a decision is part of authoring it. Making the
   * decision is stronger, and the service asserts `procurement.pr.approve` for `approved` and
   * `rejected` on top of this.
   */
  @Patch('purchase-requests/:id/status')
  @Permissions('procurement.pr.update')
  async changePrStatus(
    @Param('id') id: string,
    @Body() dto: { status: PurchaseRequestStatus },
  ): Promise<PurchaseRequest> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const found = await this.prs.get(id);
    if (!found) throw new NotFoundException(`purchase request ${id} not found`);
    const ctx = this.tenant.get();
    return await this.prs.changeStatus(id, dto.status, ctx.actorId ?? undefined);
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
  async getRfq(@Param('id') id: string): Promise<{ rfq: Rfq; quotes: RfqQuote[] }> {
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
    if (dto.leadTimeDays !== undefined && dto.leadTimeDays !== null) {
      throw new BadRequestException(
        'lead time must be recorded on the quotation line it applies to, not on the quotation — ' +
        'an overall figure cannot say when each item arrives',
      );
    }
    const ctx = this.tenant.get();
    return this.rfqs.addQuote({
      rfqId: id,
      tenantId: ctx.tenantId,
      supplierName: dto.supplierName,
      supplierId: dto.supplierId ?? null,
      amount: dto.amount,
      currency: dto.currency ?? null,
      taxTreatment: dto.taxTreatment ?? null,
      taxRatePct: dto.taxRatePct ?? null,
      freightAmount: dto.freightAmount ?? null,
      freightTerms: dto.freightTerms ?? null,
      paymentTerms: dto.paymentTerms ?? null,
      validityDate: dto.validityDate ?? null,
      leadTimeDays: null,
      notes: dto.notes ?? null,
    });
  }

  /**
   * THE LEGACY AWARD, REFUSED (SUP-14).
   *
   * It awarded a quote by its header number and raised a purchase order valued at that one figure
   * with no lines — nothing to receive against, nothing to match an invoice to, and no statement of
   * the currency the supplier quoted in. It asked nothing about technical compliance and nothing
   * about whether the caller could commit the amount.
   *
   * It REFUSES rather than disappearing, so a caller still pointing here is told where the award
   * went instead of getting a 404 that reads like a bug. `awardRfq` keeps its name and its route so
   * that anything still calling it fails loudly and traceably.
   */
  @Patch('rfqs/:id/award')
  awardRfq(): never {
    throw new BadRequestException(
      'awarding a quote directly is no longer possible — an award must come from an approved sourcing ' +
        'recommendation, which records which offers were chosen, why, on what comparison, and who ' +
        'approved it: POST /procurement/rfqs/recommendations/:id/award',
    );
  }

  // ── SUPPLIER MASTER ──────────────────────────────────────────────────────

  @Post('suppliers')
  async createSupplier(
    @Body() dto: { code: string; name: string; category?: SupplierCategory; tradeLicense?: string; trn?: string; contactName?: string; email?: string; phone?: string },
  ): Promise<Supplier> {
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
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
    return await this.suppliers.changeStatus(id, dto.action);
  }
}
