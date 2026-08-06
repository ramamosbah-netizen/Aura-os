import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type CustomerRefund, CustomerRefundService } from '@aura/finance';

/** Customer refunds — cash returned to a customer (Dr AR / Cr Bank on pay). */
@Controller('finance/customer-refunds')
export class CustomerRefundsController {
  constructor(
    private readonly refunds: CustomerRefundService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  list(@Query('status') status?: string): Promise<CustomerRefund[]> {
    return this.refunds.list({ tenantId: this.tenant.get().tenantId, status: status as CustomerRefund['status'] | undefined, limit: 200 });
  }

  @Get('paged')
  paged(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.refunds.listPaged({ tenantId: this.tenant.get().tenantId }, parsePageParams(limit, offset));
  }

  @Post()
  create(
    @Body() dto: { refundNumber: string; customerName: string; reference?: string; reason?: string; amount: number; currency?: string; refundDate: string },
  ): Promise<CustomerRefund> {
    if (!dto?.refundNumber?.trim()) throw new BadRequestException('refundNumber is required');
    if (!dto?.customerName?.trim()) throw new BadRequestException('customerName is required');
    if (!dto?.refundDate) throw new BadRequestException('refundDate is required');
    if (!(Number(dto.amount) > 0)) throw new BadRequestException('amount must be positive');
    const ctx = this.tenant.get();
    return this.refunds.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      refundNumber: dto.refundNumber,
      customerName: dto.customerName,
      reference: dto.reference,
      reason: dto.reason,
      amount: Number(dto.amount),
      currency: dto.currency,
      refundDate: dto.refundDate,
      createdBy: ctx.actorId,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<CustomerRefund> {
    const found = await this.refunds.get(id);
    if (!found) throw new NotFoundException(`customer refund ${id} not found`);
    return found;
  }

  @Post(':id/pay')
  pay(@Param('id') id: string): Promise<CustomerRefund> {
    return this.refunds.pay(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string): Promise<CustomerRefund> {
    return this.refunds.cancel(id);
  }
}
