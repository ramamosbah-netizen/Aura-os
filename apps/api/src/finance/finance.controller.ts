import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type Invoice, type InvoiceStatus, InvoiceService } from '@aura/finance';

interface CreateInvoiceDto {
  title: string;
  reference?: string;
  poId?: string | null;
  poTitle?: string | null;
  supplierName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  status?: InvoiceStatus;
  value?: number;
}

/** Finance API — stamps tenant/actor from context, delegates to InvoiceService. */
@Controller('finance/invoices')
export class FinanceController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateInvoiceDto): Promise<Invoice> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.invoices.create({
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
    });
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('poId') poId?: string,
    @Query('projectId') projectId?: string,
  ): Promise<Invoice[]> {
    return this.invoices.list({ status, poId, projectId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Invoice> {
    const found = await this.invoices.get(id);
    if (!found) throw new NotFoundException(`invoice ${id} not found`);
    return found;
  }
}
