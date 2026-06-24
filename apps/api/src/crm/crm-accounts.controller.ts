import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type Account, type AccountStatus, AccountService } from '@aura/crm';

interface CreateAccountDto {
  name: string;
  status?: AccountStatus;
  industry?: string;
  website?: string;
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
  create(@Body() dto: CreateAccountDto): Promise<Account> {
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
    });
  }

  @Get()
  list(@Query('status') status?: string): Promise<Account[]> {
    return this.accounts.list({ status, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Account> {
    const found = await this.accounts.get(id);
    if (!found) throw new NotFoundException(`account ${id} not found`);
    return found;
  }
}
