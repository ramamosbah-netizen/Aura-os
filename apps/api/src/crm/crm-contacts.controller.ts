import { BadRequestException, Body, Controller, Get, Header, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams, toCsv } from '@aura/shared';
import { RELATIONSHIP_STRENGTHS, STAKEHOLDER_ROLES, type Contact, type ContactStatus, type RelationshipStrength, type StakeholderRole, AccountService, ContactService } from '@aura/crm';
import { accountSnapshotPatch, resolveAccountSnapshot } from '../common/account-snapshot';

class CreateContactDto {
  @IsString() name!: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsIn(STAKEHOLDER_ROLES) stakeholderRole?: StakeholderRole;
  @IsOptional() @IsIn(RELATIONSHIP_STRENGTHS) relationshipStrength?: RelationshipStrength;
  @IsOptional() @IsString() reportsToId?: string;
  @IsOptional() @IsString() reportsToName?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: ContactStatus;
}

class UpdateContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsIn(STAKEHOLDER_ROLES) stakeholderRole?: StakeholderRole;
  @IsOptional() @IsIn(RELATIONSHIP_STRENGTHS) relationshipStrength?: RelationshipStrength;
  @IsOptional() @IsString() reportsToId?: string;
  @IsOptional() @IsString() reportsToName?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: ContactStatus;
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
    private readonly accounts: AccountService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  async create(@Body() dto: CreateContactDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Contact> {
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
    if (dto.accountId && !(await this.accounts.get(dto.accountId))) throw new BadRequestException('account not found');
    return this.contacts.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      accountId: dto.accountId ?? null,
      accountName: await resolveAccountSnapshot(this.accounts, dto.accountId, dto.accountName),
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
    }, idempotencyKey);
  }

  @Patch(':id')
  async update(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateContactDto): Promise<Contact> {
    try {
      if (dto.accountId && !(await this.accounts.get(dto.accountId))) throw new BadRequestException('account not found');
      return await this.contacts.update(id, {
        ...dto,
        ...(await accountSnapshotPatch(this.accounts, dto.accountId, dto.accountName)),
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'update failed');
    }
  }

  @Get()
  list(
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('stakeholderRole') stakeholderRole?: string,
    @Query('relationshipStrength') relationshipStrength?: string,
  ): Promise<Contact[]> {
    return this.contacts.list({ tenantId: this.tenant.get().tenantId, accountId, status, search, stakeholderRole, relationshipStrength, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('stakeholderRole') stakeholderRole?: string,
    @Query('relationshipStrength') relationshipStrength?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filter = { tenantId: this.tenant.get().tenantId, accountId, status, search, stakeholderRole, relationshipStrength };
    const page = parsePageParams(limit, offset);
    return Promise.all([this.contacts.listPaged(filter, page), this.contacts.summary(filter)])
      .then(([result, summary]) => ({ ...result, summary }));
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="contacts.csv"')
  async exportCsv(
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('stakeholderRole') stakeholderRole?: string,
    @Query('relationshipStrength') relationshipStrength?: string,
  ): Promise<string> {
    const rows = await this.contacts.listAll({
      tenantId: this.tenant.get().tenantId, accountId, status, search, stakeholderRole, relationshipStrength,
    });
    return toCsv(rows.map((c) => ({
      name: c.name,
      jobTitle: c.jobTitle ?? '',
      accountName: c.accountName ?? '',
      stakeholderRole: c.stakeholderRole ?? '',
      relationshipStrength: c.relationshipStrength ?? '',
      reportsToName: c.reportsToName ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      isPrimary: c.isPrimary,
      status: c.status,
      ownerId: c.ownerId ?? '',
    })), ['name', 'jobTitle', 'accountName', 'stakeholderRole', 'relationshipStrength', 'reportsToName', 'email', 'phone', 'isPrimary', 'status', 'ownerId']);
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Contact> {
    const found = await this.contacts.get(id);
    if (!found) throw new NotFoundException(`contact ${id} not found`);
    return found;
  }
}
