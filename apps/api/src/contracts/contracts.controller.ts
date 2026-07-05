import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type Contract, type ContractStatus, ContractService } from '@aura/contracts';

class CreateContractDto {
  @IsString() title!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() tenderId?: string | null;
  @IsOptional() @IsString() tenderTitle?: string | null;
  @IsOptional() @IsString() accountId?: string | null;
  @IsOptional() @IsString() accountName?: string | null;
  @IsOptional() @IsString() status?: ContractStatus;
  @IsOptional() @IsNumber() value?: number;
}

class UpdateContractDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsNumber() value?: number;
}

/** Contracts API — stamps tenant/actor from context, delegates to ContractService. */
@Controller('contracts/contracts')
export class ContractsController {
  constructor(
    private readonly contracts: ContractService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateContractDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Contract> {
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
    }, idempotencyKey);
  }

  /** PATCH /api/contracts/contracts/:id — update mutable fields (title, reference, value, account). */
  @Patch(':id')
  async update(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateContractDto): Promise<Contract> {
    try {
      return await this.contracts.update(id, {
        title: dto.title,
        reference: dto.reference,
        value: dto.value,
        accountId: dto.accountId,
        accountName: dto.accountName,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  /**
   * PATCH /api/contracts/contracts/:id/status
   * Transition a contract's status. Setting to 'active' means "signed" →
   * triggers auto-creation of a Project via the cross-module subscriber.
   */
  @Patch(':id/status')
  async changeStatus(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { status: ContractStatus },
  ): Promise<Contract> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const found = await this.contracts.get(id);
    if (!found) throw new NotFoundException(`contract ${id} not found`);
    return this.contracts.changeStatus(id, dto.status);
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('tenderId') tenderId?: string,
  ): Promise<Contract[]> {
    return this.contracts.list({ status, accountId, tenderId, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('tenderId') tenderId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.contracts.listPaged(
      { tenantId: this.tenant.get().tenantId, status, accountId, tenderId },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Contract> {
    const found = await this.contracts.get(id);
    if (!found) throw new NotFoundException(`contract ${id} not found`);
    return found;
  }
}
