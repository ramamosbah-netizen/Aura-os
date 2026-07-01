import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type Quotation, type NewQuotationLine, QuotationService } from '@aura/crm';
import { type Contract, ContractService } from '@aura/contracts';

interface CreateQuotationDto {
  quoteNumber: string;
  customerName: string;
  accountId?: string;
  contactName?: string;
  issueDate: string;
  validUntil?: string;
  lines: NewQuotationLine[];
}

/** CRM customer-quotation API — stamps tenant/actor, delegates to QuotationService. */
@Controller('crm/quotations')
export class CrmQuotationsController {
  constructor(
    private readonly quotations: QuotationService,
    private readonly contracts: ContractService,
    private readonly tenant: TenantContext,
  ) {}

  /** One-click convert an accepted quotation into a draft contract (carries value + account). */
  @Post(':id/convert-to-contract')
  async convertToContract(@Param('id') id: string): Promise<Contract> {
    const q = await this.quotations.get(id);
    if (!q) throw new NotFoundException(`quotation ${id} not found`);
    if (q.status !== 'accepted') throw new BadRequestException(`quotation must be 'accepted' to convert (is '${q.status}')`);
    const ctx = this.tenant.get();
    return this.contracts.create(
      {
        tenantId: ctx.tenantId,
        companyId: q.companyId,
        title: `Contract from ${q.quoteNumber} — ${q.customerName}`,
        accountId: q.accountId,
        accountName: q.customerName,
        value: q.total,
        status: 'draft',
        createdBy: ctx.actorId,
      },
      `contract-from-quotation:${q.id}`,
    );
  }

  @Post()
  async create(@Body() dto: CreateQuotationDto): Promise<Quotation> {
    if (!dto?.quoteNumber?.trim()) throw new BadRequestException('quoteNumber is required');
    if (!dto?.customerName?.trim()) throw new BadRequestException('customerName is required');
    if (!dto?.issueDate) throw new BadRequestException('issueDate is required');
    if (!Array.isArray(dto?.lines) || dto.lines.length === 0) throw new BadRequestException('at least one line item is required');
    const ctx = this.tenant.get();
    try {
      return await this.quotations.create({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        quoteNumber: dto.quoteNumber,
        customerName: dto.customerName,
        accountId: dto.accountId ?? null,
        contactName: dto.contactName ?? null,
        issueDate: dto.issueDate,
        validUntil: dto.validUntil ?? null,
        lines: dto.lines,
        createdBy: ctx.actorId,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get()
  list(@Query('status') status?: Quotation['status'], @Query('accountId') accountId?: string): Promise<Quotation[]> {
    return this.quotations.list({ tenantId: this.tenant.get().tenantId, status, accountId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Quotation> {
    const found = await this.quotations.get(id);
    if (!found) throw new NotFoundException(`quotation ${id} not found`);
    return found;
  }

  @Patch(':id/status')
  async changeStatus(@Param('id') id: string, @Body() dto: { action: 'send' | 'accept' | 'reject' | 'expire' }): Promise<Quotation> {
    if (!['send', 'accept', 'reject', 'expire'].includes(dto?.action)) {
      throw new BadRequestException("action must be 'send', 'accept', 'reject', or 'expire'");
    }
    try {
      return await this.quotations.changeStatus(id, dto.action);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
