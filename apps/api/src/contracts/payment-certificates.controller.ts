import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe, Permissions } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type CertificateStatus, type PaymentCertificate, type IpcLine, PaymentCertificateService } from '@aura/contracts';

class CreateCertificateDto {
  @IsString() contractId!: string;
  @IsOptional() @IsString() periodStart?: string;
  @IsOptional() @IsString() periodEnd?: string;
  /** Typed valuation only; a contract valued by its measured lines refuses it (J5-02). */
  @IsOptional() @IsNumber() cumulativeWorkDone?: number;
  @IsOptional() @IsNumber() materialsOnSite?: number;
  @IsOptional() @IsNumber() retentionPercent?: number;
  @IsOptional() @IsNumber() retentionCapPercent?: number;
  @IsOptional() @IsNumber() advanceRecoveredToDate?: number;
  @IsOptional() @IsString() reference?: string;
}

/**
 * A measured line NAMES a frozen award item and a quantity (J5-02). The project, the unit, the rate
 * and the description are the award's. The retired fields are still declared so that sending one is
 * REFUSED rather than silently stripped by the whitelist pipe — a caller who typed a rate must be
 * told it was not used.
 */
class AddIpcLineDto {
  @IsString() frozenItemKey!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsNumber() rate?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() boqItemId?: string;
  @IsOptional() @IsString() description?: string;
}

const VALID: CertificateStatus[] = ['draft', 'submitted', 'certified', 'paid', 'rejected'];

/** Payment Certificates (IPC) API — progress billing against a contract. */
@Controller('contracts/certificates')
export class PaymentCertificatesController {
  constructor(
    private readonly certificates: PaymentCertificateService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateCertificateDto): Promise<PaymentCertificate> {
    if (!dto?.contractId) throw new BadRequestException('contractId is required');
    if (dto.cumulativeWorkDone !== undefined && !(Number(dto.cumulativeWorkDone) >= 0)) {
      throw new BadRequestException('cumulativeWorkDone must be zero or positive');
    }
    const ctx = this.tenant.get();
    return this.certificates.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      contractId: dto.contractId,
      periodStart: dto.periodStart ?? null,
      periodEnd: dto.periodEnd ?? null,
      cumulativeWorkDone: dto.cumulativeWorkDone === undefined ? undefined : Number(dto.cumulativeWorkDone),
      materialsOnSite: dto.materialsOnSite,
      retentionPercent: dto.retentionPercent,
      retentionCapPercent: dto.retentionCapPercent,
      advanceRecoveredToDate: dto.advanceRecoveredToDate,
      reference: dto.reference ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(@Query('contractId') contractId?: string, @Query('status') status?: string): Promise<PaymentCertificate[]> {
    const ctx = this.tenant.get();
    return this.certificates.list({ tenantId: ctx.tenantId, contractId, status, limit: 200 });
  }

  @Get('paged')
  paged(
    @Query('contractId') contractId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.certificates.listPaged(
      { tenantId: this.tenant.get().tenantId, contractId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get('summary/:contractId')
  summary(@Param('contractId') contractId: string) {
    const ctx = this.tenant.get();
    return this.certificates.getContractSummary(ctx.tenantId, contractId);
  }

  /**
   * What a certificate on this contract may claim: the frozen award items of its project, each with
   * its unit, rate, installed and certified quantities and what is still eligible (J5-02).
   */
  @Get('claimable/:contractId')
  claimable(@Param('contractId', ParseUuidOr404Pipe) contractId: string) {
    return this.certificates.claimable(this.tenant.get().tenantId, contractId);
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<PaymentCertificate> {
    const found = await this.certificates.get(id);
    if (!found) throw new NotFoundException(`payment certificate ${id} not found`);
    return found;
  }

  /** Measure a frozen award item on a draft IPC. On certification each line posts its quantity to
   *  the Quantity Ledger as the item's CERTIFIED position. */
  @Post(':id/lines')
  @Permissions('contracts.certificate.lines')
  addLine(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AddIpcLineDto): Promise<IpcLine> {
    const typed = (['rate', 'unit', 'projectId', 'boqItemId', 'description'] as const).filter((k) => dto?.[k] !== undefined);
    if (typed.length) {
      throw new BadRequestException(`${typed.join(', ')} cannot be typed on a measured line — the project, unit, rate and description are the frozen award's; send frozenItemKey and quantity`);
    }
    if (!dto?.frozenItemKey?.trim()) throw new BadRequestException('frozenItemKey is required');
    if (!(Number(dto.quantity) > 0)) throw new BadRequestException('quantity must be positive');
    return this.certificates.addLine({ certificateId: id, frozenItemKey: dto.frozenItemKey.trim(), quantity: Number(dto.quantity) });
  }

  @Get(':id/lines')
  listLines(@Param('id', ParseUuidOr404Pipe) id: string): Promise<IpcLine[]> {
    return this.certificates.listLines(id, this.tenant.get().tenantId);
  }

  @Patch(':id/status')
  @Permissions('contracts.certificate.status')
  async changeStatus(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { status: CertificateStatus },
  ): Promise<PaymentCertificate> {
    if (!dto?.status || !VALID.includes(dto.status)) throw new BadRequestException('valid status is required');
    const found = await this.certificates.get(id);
    if (!found) throw new NotFoundException(`payment certificate ${id} not found`);
    const ctx = this.tenant.get();
    return this.certificates.changeStatus(id, dto.status, ctx.actorId ?? undefined);
  }
}
