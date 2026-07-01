import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type Contact, type ContactStatus, ContactService } from '@aura/crm';

interface CreateContactDto {
  name: string;
  accountId?: string;
  accountName?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  status?: ContactStatus;
}

/**
 * CRM contacts API. Stamps tenant/actor from the request context and delegates to
 * the module's ContactService — the controller holds no business logic.
 */
@Controller('crm/contacts')
export class CrmContactsController {
  constructor(
    private readonly contacts: ContactService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateContactDto): Promise<Contact> {
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
    return this.contacts.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      accountId: dto.accountId ?? null,
      accountName: dto.accountName ?? null,
      name: dto.name,
      jobTitle: dto.jobTitle ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      isPrimary: dto.isPrimary,
      status: dto.status,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
  ): Promise<Contact[]> {
    return this.contacts.list({ tenantId: this.tenant.get().tenantId, accountId, status, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.contacts.listPaged(
      { tenantId: this.tenant.get().tenantId, accountId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Contact> {
    const found = await this.contacts.get(id);
    if (!found) throw new NotFoundException(`contact ${id} not found`);
    return found;
  }
}
