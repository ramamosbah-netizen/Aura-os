import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import {
  type Subcontract,
  type SubcontractStatus,
  type Claim,
  type ClaimStatus,
  type BackCharge,
  type BackChargeStatus,
  type BackChargeCategory,
  summariseBackCharges,
  SubcontractsService,
} from '@aura/subcontracts';

interface CreateSubcontractDto {
  projectId: string;
  projectName?: string;
  title: string;
  subcontractorName: string;
  value: number;
  retentionPercentage?: number;
}

interface CreateClaimDto {
  subcontractId: string;
  workCompletedValue?: number;
  isRetentionRelease?: boolean;
  retentionReleased?: number;
}

interface CreateBackChargeDto {
  subcontractId: string;
  category?: BackChargeCategory;
  description: string;
  grossAmount: number;
  markupPercent?: number;
}

@Controller('subcontracts')
export class SubcontractsController {
  constructor(
    private readonly subcontracts: SubcontractsService,
    private readonly tenant: TenantContext,
  ) {}

  // ── SUBCONTRACTS ─────────────────────────────────────────────────────────

  @Post()
  createSubcontract(@Body() dto: CreateSubcontractDto): Promise<Subcontract> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.subcontractorName?.trim()) throw new BadRequestException('subcontractorName is required');
    if (dto?.value === undefined) throw new BadRequestException('value is required');

    const ctx = this.tenant.get();
    return this.subcontracts.createSubcontract({
      tenantId: ctx.tenantId,
      projectId: dto.projectId,
      projectName: dto.projectName,
      title: dto.title,
      subcontractorName: dto.subcontractorName,
      value: dto.value,
      retentionPercentage: dto.retentionPercentage,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  listSubcontracts(
    @Query('projectId') projectId?: string,
    @Query('status') status?: SubcontractStatus,
  ): Promise<Subcontract[]> {
    const ctx = this.tenant.get();
    return this.subcontracts.listSubcontracts({
      tenantId: ctx.tenantId,
      projectId,
      status,
    });
  }

  // ── CLAIMS (literal routes before :id to avoid route-order capture) ─────

  @Post('claims')
  createClaim(@Body() dto: CreateClaimDto): Promise<Claim> {
    if (!dto?.subcontractId) throw new BadRequestException('subcontractId is required');
    if (!dto.isRetentionRelease && dto?.workCompletedValue === undefined) {
      throw new BadRequestException('workCompletedValue is required for standard claims');
    }

    const ctx = this.tenant.get();
    return this.subcontracts.createClaim({
      tenantId: ctx.tenantId,
      subcontractId: dto.subcontractId,
      workCompletedValue: dto.workCompletedValue ?? 0,
      isRetentionRelease: dto.isRetentionRelease,
      retentionReleased: dto.retentionReleased,
      createdBy: ctx.actorId,
    });
  }

  @Get('claims')
  listClaims(
    @Query('subcontractId') subcontractId?: string,
    @Query('status') status?: ClaimStatus,
  ): Promise<Claim[]> {
    const ctx = this.tenant.get();
    return this.subcontracts.listClaims({
      tenantId: ctx.tenantId,
      subcontractId,
      status,
    });
  }

  @Get('claims/:id')
  async getClaim(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Claim> {
    const found = await this.subcontracts.getClaim(id);
    if (!found) throw new NotFoundException(`Claim ${id} not found`);
    return found;
  }

  @Patch('claims/:id/certify')
  certifyClaim(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Claim> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new BadRequestException('Authentication required');
    return this.subcontracts.certifyClaim(id, ctx.actorId);
  }

  @Patch('claims/:id/pay')
  payClaim(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Claim> {
    const ctx = this.tenant.get();
    return this.subcontracts.payClaim(id, ctx.actorId ?? undefined);
  }

  // ── BACK-CHARGES (literal routes before :id to avoid route-order capture) ─

  @Post('back-charges')
  createBackCharge(@Body() dto: CreateBackChargeDto): Promise<BackCharge> {
    if (!dto?.subcontractId) throw new BadRequestException('subcontractId is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!(Number(dto?.grossAmount) > 0)) throw new BadRequestException('grossAmount must be positive');

    const ctx = this.tenant.get();
    return this.subcontracts.createBackCharge({
      tenantId: ctx.tenantId,
      subcontractId: dto.subcontractId,
      category: dto.category,
      description: dto.description,
      grossAmount: Number(dto.grossAmount),
      markupPercent: dto.markupPercent,
      createdBy: ctx.actorId,
    });
  }

  @Get('back-charges')
  listBackCharges(
    @Query('subcontractId') subcontractId?: string,
    @Query('status') status?: BackChargeStatus,
  ): Promise<BackCharge[]> {
    const ctx = this.tenant.get();
    return this.subcontracts.listBackCharges({
      tenantId: ctx.tenantId,
      subcontractId,
      status,
    });
  }

  @Get('back-charges/summary')
  async backChargeSummary(@Query('subcontractId') subcontractId?: string): Promise<ReturnType<typeof summariseBackCharges>> {
    const ctx = this.tenant.get();
    const list = await this.subcontracts.listBackCharges({ tenantId: ctx.tenantId, subcontractId });
    return summariseBackCharges(list);
  }

  @Get('back-charges/:id')
  async getBackCharge(@Param('id', ParseUuidOr404Pipe) id: string): Promise<BackCharge> {
    const found = await this.subcontracts.getBackCharge(id);
    if (!found) throw new NotFoundException(`Back-charge ${id} not found`);
    return found;
  }

  @Patch('back-charges/:id/status')
  changeBackChargeStatus(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { status: BackChargeStatus },
  ): Promise<BackCharge> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const ctx = this.tenant.get();
    return this.subcontracts.changeBackChargeStatus(id, dto.status, ctx.actorId ?? undefined);
  }

  @Patch('back-charges/:id/recover')
  recoverBackCharge(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { amount: number },
  ): Promise<BackCharge> {
    if (!(Number(dto?.amount) > 0)) throw new BadRequestException('amount must be positive');
    const ctx = this.tenant.get();
    return this.subcontracts.recoverBackCharge(id, Number(dto.amount), ctx.actorId ?? undefined);
  }

  // ── SUBCONTRACT by ID (after literal routes) ───────────────────────────

  @Get(':id')
  async getSubcontract(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Subcontract> {
    const found = await this.subcontracts.getSubcontract(id);
    if (!found) throw new NotFoundException(`Subcontract ${id} not found`);
    return found;
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { status: SubcontractStatus },
  ): Promise<Subcontract> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const ctx = this.tenant.get();
    return this.subcontracts.changeSubcontractStatus(id, dto.status, ctx.actorId ?? undefined);
  }
}
