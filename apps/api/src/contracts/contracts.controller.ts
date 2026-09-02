import { BadRequestException, Body, Controller, Get, Headers, Inject, NotFoundException, Optional, Param, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { ContractAmendmentService, ContractApprovalService, ContractClientShareService, ContractNegotiationService, ContractRevisionService, type Contract, type ContractRevisionClause, type ContractRevisionStatus, type ContractStatus, ContractService } from '@aura/contracts';
import { AccountService } from '@aura/crm';
import { accountSnapshotPatch, resolveAccountSnapshot } from '../common/account-snapshot';

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

const CONTRACT_STATUSES: ContractStatus[] = ['draft', 'active', 'completed', 'cancelled'];

/** Contracts API — stamps tenant/actor from context, delegates to ContractService. */
@Controller('contracts/contracts')
export class ContractsController {
  constructor(
    private readonly contracts: ContractService,
    private readonly accounts: AccountService,
    private readonly tenant: TenantContext,
    private readonly revisions?: ContractRevisionService,
    private readonly negotiation?: ContractNegotiationService,
    private readonly shares?: ContractClientShareService,
    private readonly amendments?: ContractAmendmentService,
    @Optional() @Inject(ContractApprovalService) private readonly approvals?: ContractApprovalService,
  ) {}

  @Post()
  async create(@Body() dto: CreateContractDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Contract> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    // The HTTP create route is the manual/compatibility boundary. A missing or invalid amount is
    // not evidence of a zero-value contract: reject it here. Governed quotation/tender conversion
    // calls ContractService directly with their approved commercial amount and are unaffected.
    if (dto.value === undefined || !Number.isFinite(dto.value) || dto.value < 0) {
      throw new BadRequestException('value is required and must be a finite non-negative number');
    }
    const ctx = this.tenant.get();
    return this.contracts.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      tenderId: dto.tenderId ?? null,
      tenderTitle: dto.tenderTitle ?? null,
      accountId: dto.accountId ?? null,
      accountName: await resolveAccountSnapshot(this.accounts, dto.accountId, dto.accountName),
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
        ...(await accountSnapshotPatch(this.accounts, dto.accountId, dto.accountName)),
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
    if (!dto?.status || !CONTRACT_STATUSES.includes(dto.status)) {
      throw new BadRequestException(`status must be one of ${CONTRACT_STATUSES.join(', ')}`);
    }
    const found = await this.contracts.get(id);
    if (!found) throw new NotFoundException(`contract ${id} not found`);
    // Let the global error taxonomy preserve governed authorization (403) and
    // conflict (409) semantics. Wrapping every domain error as BadRequest would
    // turn SoD/approval denials into misleading validation failures.
    return this.contracts.changeStatus(id, dto.status, this.tenant.get().actorId ?? undefined);
  }

  /** Governed terminal command: complete an active contract after reviewing closeout readiness. */
  @Post(':id/complete')
  async complete(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Contract> {
    try {
      return await this.contracts.changeStatus(id, 'completed', this.tenant.get().actorId ?? undefined);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'invalid contract completion');
    }
  }

  /** Governed terminal command: cancel a draft/active contract with an explicit command boundary. */
  @Post(':id/cancel')
  async cancel(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Contract> {
    try {
      return await this.contracts.changeStatus(id, 'cancelled', this.tenant.get().actorId ?? undefined);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'invalid contract cancellation');
    }
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('tenderId') tenderId?: string,
  ): Promise<Contract[]> {
    // Keep the non-paged compatibility register tenant-scoped as well as the paged endpoint.
    // Postgres RLS is defence in depth; the application filter is required for memory mode and
    // for any deployment where the store is not running under a bypass-free role.
    return this.contracts.list({ tenantId: this.tenant.get().tenantId, status, accountId, tenderId, limit: 100 });
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

  @Get(':id/revisions')
  revisionsList(@Param('id', ParseUuidOr404Pipe) id: string) {
    if (!this.revisions) throw new NotFoundException('contract revisions unavailable');
    return this.revisions.list(id);
  }

  @Post(':id/revisions')
  revisionsCreate(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: { revisionReason?: string; terms?: Record<string, unknown>; clauses?: ContractRevisionClause[] }) {
    if (!this.revisions) throw new NotFoundException('contract revisions unavailable');
    const ctx = this.tenant.get();
    return this.revisions.create({ tenantId: ctx.tenantId, contractId: id, revisionReason: dto?.revisionReason, terms: dto?.terms, clauses: dto?.clauses, createdBy: ctx.actorId });
  }

  @Patch(':id/revisions/:revisionId/status')
  async revisionsStatus(@Param('id', ParseUuidOr404Pipe) contractId: string, @Param('revisionId', ParseUuidOr404Pipe) revisionId: string, @Body() dto: { status: ContractRevisionStatus }) {
    if (!this.revisions) throw new NotFoundException('contract revisions unavailable');
    const valid: ContractRevisionStatus[] = ['draft','internal_review','client_review','negotiation','approved','signed','returned','rejected','superseded'];
    if (!valid.includes(dto?.status)) throw new BadRequestException(`status must be one of ${valid.join(', ')}`);
    try {
      if (dto.status === 'approved' || dto.status === 'returned' || dto.status === 'rejected') {
        return await this.revisions.decideApprovalForContract(contractId, revisionId, dto.status, this.tenant.get().actorId);
      }
      return await this.revisions.transitionForContract(contractId, revisionId, dto.status, this.tenant.get().actorId);
    }
    catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'invalid revision transition'); }
  }

  @Post(':id/revisions/:revisionId/submit-approval')
  revisionSubmitApproval(@Param('id', ParseUuidOr404Pipe) contractId: string, @Param('revisionId', ParseUuidOr404Pipe) revisionId: string) {
    if (!this.revisions) throw new NotFoundException('contract revisions unavailable');
    return this.revisions.submitForApprovalForContract(contractId, revisionId, this.tenant.get().actorId);
  }

  @Get(':id/revisions/:revisionId/approval')
  async revisionApproval(@Param('id', ParseUuidOr404Pipe) contractId: string, @Param('revisionId', ParseUuidOr404Pipe) revisionId: string) {
    if (!this.approvals) throw new NotFoundException('contract approvals unavailable');
    const r=await this.revisions?.get(revisionId); if(!r || r.contractId!==contractId) throw new NotFoundException('contract revision not found');
    return this.approvals.get('revision', revisionId);
  }

  @Get(':id/negotiation')
  negotiationList(@Param('id', ParseUuidOr404Pipe) id: string, @Query('revisionId') revisionId?: string) {
    if (!this.negotiation) throw new NotFoundException('contract negotiation unavailable');
    return this.negotiation.list(id, revisionId);
  }

  @Post(':id/negotiation')
  negotiationCreate(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: { revisionId: string; type: 'comment'|'change_request'; content: string; visibility?: 'internal'|'client_visible'; ownerId?: string | null }) {
    if (!this.negotiation) throw new NotFoundException('contract negotiation unavailable');
    const ctx = this.tenant.get();
    return this.negotiation.create({ tenantId: ctx.tenantId, contractId: id, revisionId: dto?.revisionId, type: dto?.type, content: dto?.content, visibility: dto?.visibility, ownerId: dto?.ownerId, createdBy: ctx.actorId });
  }

  @Patch(':id/negotiation/:itemId')
  async negotiationResolve(@Param('itemId', ParseUuidOr404Pipe) itemId: string, @Body() dto: { status: 'resolved'|'rejected'; resolution: string }) {
    if (!this.negotiation) throw new NotFoundException('contract negotiation unavailable');
    try { return await this.negotiation.resolve(itemId, dto?.status, dto?.resolution); }
    catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'invalid negotiation resolution'); }
  }

  @Get(':id/client-shares')
  clientShares(@Param('id', ParseUuidOr404Pipe) id: string) {
    if (!this.shares) throw new NotFoundException('client sharing unavailable');
    return this.shares.list(id);
  }

  @Post(':id/client-shares')
  clientShareCreate(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: { revisionId: string; recipient: string; method: 'download'|'email'|'link'; correlationId?: string }) {
    if (!this.shares) throw new NotFoundException('client sharing unavailable');
    const ctx = this.tenant.get();
    return this.shares.create({ tenantId: ctx.tenantId, contractId: id, revisionId: dto?.revisionId, recipient: dto?.recipient, method: dto?.method, correlationId: dto?.correlationId, sharedBy: ctx.actorId });
  }

  @Post(':id/client-shares/:shareId/dispatch')
  async clientShareDispatch(@Param('shareId', ParseUuidOr404Pipe) shareId: string) {
    if (!this.shares) throw new NotFoundException('client sharing unavailable');
    try { return await this.shares.dispatch(shareId); }
    catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'unable to dispatch client share'); }
  }

  @Get(':id/amendments')
  amendmentsList(@Param('id', ParseUuidOr404Pipe) id: string) {
    if (!this.amendments) throw new NotFoundException('amendments unavailable');
    return this.amendments.list(id);
  }

  @Post(':id/amendments')
  amendmentsCreate(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: { baseRevisionId: string; title: string; content: string; sourceVariationId?: string | null }) {
    if (!this.amendments) throw new NotFoundException('amendments unavailable');
    const ctx = this.tenant.get();
    return this.amendments.create({ tenantId: ctx.tenantId, contractId: id, baseRevisionId: dto?.baseRevisionId, title: dto?.title, content: dto?.content, sourceVariationId: dto?.sourceVariationId, createdBy: ctx.actorId });
  }

  @Patch(':id/amendments/:amendmentId/status')
  async amendmentsStatus(@Param('id', ParseUuidOr404Pipe) contractId: string, @Param('amendmentId', ParseUuidOr404Pipe) amendmentId: string, @Body() dto: { status: import('@aura/contracts').ContractAmendmentStatus }) {
    if (!this.amendments) throw new NotFoundException('amendments unavailable');
    try {
      if (dto?.status === 'approved' || dto?.status === 'returned' || dto?.status === 'rejected') {
        return await this.amendments.decideApprovalForContract(contractId, amendmentId, dto.status, this.tenant.get().actorId);
      }
      const list=await this.amendments.list(contractId); if(!list.some(a=>a.id===amendmentId)) throw new Error('amendment does not belong to contract');
      return await this.amendments.transition(amendmentId, dto?.status, this.tenant.get().actorId);
    }
    catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'invalid amendment transition'); }
  }

  @Post(':id/amendments/:amendmentId/submit-approval')
  amendmentSubmitApproval(@Param('id', ParseUuidOr404Pipe) contractId: string, @Param('amendmentId', ParseUuidOr404Pipe) amendmentId: string) {
    if (!this.amendments) throw new NotFoundException('amendments unavailable');
    return this.amendments.submitForApprovalForContract(contractId, amendmentId, this.tenant.get().actorId);
  }

  @Get(':id/amendments/:amendmentId/approval')
  async amendmentApproval(@Param('id', ParseUuidOr404Pipe) contractId: string, @Param('amendmentId', ParseUuidOr404Pipe) amendmentId: string) {
    if (!this.approvals) throw new NotFoundException('contract approvals unavailable');
    const list=await this.amendments?.list(contractId); if(!list?.some(a=>a.id===amendmentId)) throw new NotFoundException('contract amendment not found');
    return this.approvals.get('amendment', amendmentId);
  }
}
