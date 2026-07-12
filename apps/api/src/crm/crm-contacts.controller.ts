import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type Contact, type ContactStatus, type RelationshipStrength, type StakeholderRole, ContactService } from '@aura/crm';

class CreateContactDto {
  @IsString() name!: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() stakeholderRole?: StakeholderRole;
  @IsOptional() @IsString() relationshipStrength?: RelationshipStrength;
  @IsOptional() @IsString() reportsToId?: string;
  @IsOptional() @IsString() reportsToName?: string;
  @IsOptional() @IsString() status?: ContactStatus;
}

class UpdateContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() stakeholderRole?: StakeholderRole;
  @IsOptional() @IsString() relationshipStrength?: RelationshipStrength;
  @IsOptional() @IsString() reportsToId?: string;
  @IsOptional() @IsString() reportsToName?: string;
  @IsOptional() @IsString() status?: ContactStatus;
  @IsOptional() @IsString() ownerId?: string;
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
      stakeholderRole: dto.stakeholderRole ?? null,
      relationshipStrength: dto.relationshipStrength ?? null,
      reportsToId: dto.reportsToId ?? null,
      reportsToName: dto.reportsToName ?? null,
      status: dto.status,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Patch(':id')
  async update(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateContactDto): Promise<Contact> {
    try {
      return await this.contacts.update(id, dto);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'update failed');
    }
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
