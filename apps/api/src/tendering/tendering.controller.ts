import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type Tender, type TenderStatus, TenderService } from '@aura/tendering';

interface CreateTenderDto {
  title: string;
  reference?: string;
  accountId?: string | null;
  accountName?: string | null;
  status?: TenderStatus;
  value?: number;
}

/** Tendering API — stamps tenant/actor from context, delegates to TenderService. */
@Controller('tendering/tenders')
export class TenderingController {
  constructor(
    private readonly tenders: TenderService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateTenderDto): Promise<Tender> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.tenders.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      accountId: dto.accountId ?? null,
      accountName: dto.accountName ?? null,
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(@Query('status') status?: string, @Query('accountId') accountId?: string): Promise<Tender[]> {
    return this.tenders.list({ status, accountId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Tender> {
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return found;
  }
}
