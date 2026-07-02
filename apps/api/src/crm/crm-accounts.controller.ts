import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type Account, type AccountStatus, AccountService } from '@aura/crm';

class CreateAccountDto {
  @IsString() name!: string;
  @IsOptional() @IsString() status?: AccountStatus;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() website?: string;
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
}
