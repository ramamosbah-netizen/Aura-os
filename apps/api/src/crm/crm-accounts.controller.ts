import { BadRequestException, Body, Controller, Delete, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  ACCOUNT_RELATIONSHIP_TYPES,
  AMC_STATUSES,
  INSTALLED_PROVIDERS,
  PARTY_TYPES,
  type Account,
  type AccountGraph,
  type AccountRelationship,
  type AccountRelationshipType,
  type AccountStatus,
  type AmcStatus,
  type GrowthScanResult,
  type InstalledBaseItem,
  type InstalledBaseView,
  type InstalledProvider,
  type PartyType,
  AccountRelationshipService,
  AccountService,
  InstalledBaseService,
} from '@aura/crm';
import { ELV_SYSTEMS, type ElvSystem } from '@aura/shared';

class CreateAccountDto {
  @IsString() name!: string;
  @IsOptional() @IsString() status?: AccountStatus;
  @IsOptional() @IsIn(PARTY_TYPES) partyType?: PartyType;
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
  @IsOptional() @IsIn(PARTY_TYPES) partyType?: PartyType;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() ownerId?: string;
}

class InstalledBaseDto {
  @IsIn(ELV_SYSTEMS) system!: ElvSystem;
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsIn(INSTALLED_PROVIDERS) provider?: InstalledProvider;
  @IsOptional() @IsString() competitorName?: string;
  @IsOptional() @IsString() installedAt?: string;
  @IsOptional() @IsString() warrantyExpiresAt?: string;
  @IsOptional() @IsIn(AMC_STATUSES) amcStatus?: AmcStatus;
  @IsOptional() @IsString() amcExpiresAt?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() notes?: string;
}

class InstalledBasePatchDto {
  @IsOptional() @IsIn(ELV_SYSTEMS) system?: ElvSystem;
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsIn(INSTALLED_PROVIDERS) provider?: InstalledProvider;
  @IsOptional() @IsString() competitorName?: string;
  @IsOptional() @IsString() installedAt?: string;
  @IsOptional() @IsString() warrantyExpiresAt?: string;
  @IsOptional() @IsIn(AMC_STATUSES) amcStatus?: AmcStatus;
  @IsOptional() @IsString() amcExpiresAt?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() notes?: string;
}

class LinkAccountDto {
  @IsUUID() toAccountId!: string;
  @IsIn(ACCOUNT_RELATIONSHIP_TYPES) type!: AccountRelationshipType;
  @IsOptional() @IsString() notes?: string;
}

/**
 * CRM accounts API. Stamps tenant/actor from the request context and delegates to
 * the module's AccountService — the controller holds no business logic.
 */
@Controller('crm/accounts')
export class CrmAccountsController {
  constructor(
    private readonly accounts: AccountService,
    private readonly graph: AccountRelationshipService,
    private readonly installedBase: InstalledBaseService,
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
      partyType: dto.partyType,
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
        partyType: dto.partyType,
        industry: dto.industry,
        website: dto.website,
        phone: dto.phone,
        email: dto.email,
        billingAddress: dto.billingAddress,
        source: dto.source,
        paymentTerms: dto.paymentTerms,
        ownerId: dto.ownerId,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  // ---- C3 (§26): installed base & white-space -------------------------------------

  /** The register + derived coverage board + current growth findings, one read. */
  @Get(':id/installed-base')
  async installedBaseView(@Param('id', ParseUuidOr404Pipe) id: string): Promise<InstalledBaseView> {
    try {
      return await this.installedBase.viewFor(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }

  @Post(':id/installed-base')
  async addInstalled(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: InstalledBaseDto): Promise<InstalledBaseItem> {
    const ctx = this.tenant.get();
    try {
      return await this.installedBase.add({ tenantId: ctx.tenantId, companyId: ctx.companyId, accountId: id, ...dto, createdBy: ctx.actorId });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  @Patch(':id/installed-base/:itemId')
  async patchInstalled(
    @Param('id', ParseUuidOr404Pipe) _id: string,
    @Param('itemId', ParseUuidOr404Pipe) itemId: string,
    @Body() dto: InstalledBasePatchDto,
  ): Promise<InstalledBaseItem> {
    try {
      return await this.installedBase.patch(itemId, this.tenant.get().tenantId, dto);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }

  @Delete(':id/installed-base/:itemId')
  async removeInstalled(
    @Param('id', ParseUuidOr404Pipe) _id: string,
    @Param('itemId', ParseUuidOr404Pipe) itemId: string,
  ): Promise<{ deleted: true }> {
    try {
      await this.installedBase.remove(itemId, this.tenant.get().tenantId);
      return { deleted: true };
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }

  /** §26's law in one route: findings become deduplicated SIGNALS on the radar — a re-scan
   * raises nothing new until the facts change. Never auto-creates opportunities. */
  @Post(':id/installed-base/scan')
  async growthScan(@Param('id', ParseUuidOr404Pipe) id: string): Promise<GrowthScanResult> {
    const ctx = this.tenant.get();
    try {
      return await this.installedBase.scan(ctx.tenantId, id, ctx.actorId);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }

  // ---- G6: the relationship graph ------------------------------------------------

  /** Record a directed edge from this account to another ("influences", "consultant for", …). */
  @Post(':id/relationships')
  async link(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: LinkAccountDto): Promise<AccountRelationship> {
    const ctx = this.tenant.get();
    try {
      return await this.graph.link({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        fromAccountId: id,
        toAccountId: dto.toAccountId,
        type: dto.type,
        notes: dto.notes,
        createdBy: ctx.actorId,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  /** The account's neighbourhood: every edge (both directions) + leads naming this account. */
  @Get(':id/relationships')
  async relationships(@Param('id', ParseUuidOr404Pipe) id: string): Promise<AccountGraph> {
    try {
      return await this.graph.graphFor(id, this.tenant.get().tenantId);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }

  @Delete(':id/relationships/:relId')
  async unlink(
    @Param('id', ParseUuidOr404Pipe) _id: string,
    @Param('relId', ParseUuidOr404Pipe) relId: string,
  ): Promise<{ deleted: true }> {
    try {
      await this.graph.unlink(relId, this.tenant.get().tenantId);
      return { deleted: true };
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }
}
