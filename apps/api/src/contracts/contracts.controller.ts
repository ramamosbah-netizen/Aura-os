import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type Contract, type ContractStatus, ContractService } from '@aura/contracts';

interface CreateContractDto {
  title: string;
  reference?: string;
  tenderId?: string | null;
  tenderTitle?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  status?: ContractStatus;
  value?: number;
}

/** Contracts API — stamps tenant/actor from context, delegates to ContractService. */
@Controller('contracts/contracts')
export class ContractsController {
  constructor(
    private readonly contracts: ContractService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateContractDto): Promise<Contract> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.contracts.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      tenderId: dto.tenderId ?? null,
      tenderTitle: dto.tenderTitle ?? null,
      accountId: dto.accountId ?? null,
      accountName: dto.accountName ?? null,
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('tenderId') tenderId?: string,
  ): Promise<Contract[]> {
    return this.contracts.list({ status, accountId, tenderId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Contract> {
    const found = await this.contracts.get(id);
    if (!found) throw new NotFoundException(`contract ${id} not found`);
    return found;
  }
}
