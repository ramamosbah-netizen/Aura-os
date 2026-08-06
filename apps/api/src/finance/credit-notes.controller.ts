import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type CreditNote, CreditNoteService, type NewCustomerInvoiceLine } from '@aura/finance';

/** AR credit notes — reduce a customer's receivable after an invoice has been issued. */
@Controller('finance/credit-notes')
export class CreditNotesController {
  constructor(
    private readonly creditNotes: CreditNoteService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  list(@Query('customerInvoiceId') customerInvoiceId?: string, @Query('status') status?: string): Promise<CreditNote[]> {
    return this.creditNotes.list({
      tenantId: this.tenant.get().tenantId,
      customerInvoiceId: customerInvoiceId || undefined,
      status: status as CreditNote['status'] | undefined,
      limit: 200,
    });
  }

  @Get('paged')
  paged(@Query('customerInvoiceId') customerInvoiceId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.creditNotes.listPaged(
      { tenantId: this.tenant.get().tenantId, customerInvoiceId: customerInvoiceId || undefined },
      parsePageParams(limit, offset),
    );
  }

  @Post()
  create(
    @Body() dto: { creditNoteNumber: string; customerInvoiceId: string; customerName?: string; reason?: string; issueDate: string; lines: NewCustomerInvoiceLine[]; currency?: string; exchangeRate?: number },
  ): Promise<CreditNote> {
    if (!dto?.creditNoteNumber?.trim()) throw new BadRequestException('creditNoteNumber is required');
    if (!dto?.customerInvoiceId?.trim()) throw new BadRequestException('customerInvoiceId is required');
    if (!dto?.issueDate) throw new BadRequestException('issueDate is required');
    if (!Array.isArray(dto?.lines) || dto.lines.length === 0) throw new BadRequestException('at least one line is required');
    const ctx = this.tenant.get();
    return this.creditNotes.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      creditNoteNumber: dto.creditNoteNumber,
      customerInvoiceId: dto.customerInvoiceId,
      customerName: dto.customerName ?? '',
      reason: dto.reason,
      issueDate: dto.issueDate,
      lines: dto.lines,
      currency: dto.currency,
      exchangeRate: dto.exchangeRate,
      createdBy: ctx.actorId,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<CreditNote> {
    const found = await this.creditNotes.get(id);
    if (!found) throw new NotFoundException(`credit note ${id} not found`);
    return found;
  }

  @Post(':id/issue')
  issue(@Param('id') id: string): Promise<CreditNote> {
    return this.creditNotes.issue(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string): Promise<CreditNote> {
    return this.creditNotes.cancel(id);
  }
}
