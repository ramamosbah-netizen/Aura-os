import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type Account, type AccountStatus, AccountService } from '@aura/crm';

class CreateAccountDto {
  @IsString() name!: string;
  @IsOptional() @IsString() status?: AccountStatus;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() paymentTerms?: string;
}

class UpdateAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() status?: AccountStatus;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() paymentTerms?: string;
}

/**
 * CRM accounts API. Stamps tenant/actor from the request context and delegates to
 * the module's AccountService — the controller holds no business logic.
 */
@Controller('crm/accounts')
export class CrmAccountsController {
  constructor(
    private readonly accounts: AccountService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateAccountDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Account> {
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
    return this.accounts.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      name: dto.name,
      status: dto.status,
      industry: dto.industry,
      website: dto.website,
      phone: dto.phone,
      email: dto.email,
      billingAddress: dto.billingAddress,
      source: dto.source,
      paymentTerms: dto.paymentTerms,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    }, idempotencyKey);
  }

  @Get()
  list(@Query('status') status?: string): Promise<Account[]> {
    return this.accounts.list({ status, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.accounts.listPaged(
      { tenantId: this.tenant.get().tenantId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Account> {
    const found = await this.accounts.get(id);
    if (!found) throw new NotFoundException(`account ${id} not found`);
    return found;
  }

  @Patch(':id')
  async update(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateAccountDto): Promise<Account> {
    try {
      return await this.accounts.update(id, {
        name: dto.name,
        status: dto.status,
        industry: dto.industry,
        website: dto.website,
        phone: dto.phone,
        email: dto.email,
        billingAddress: dto.billingAddress,
        source: dto.source,
        paymentTerms: dto.paymentTerms,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }
}
