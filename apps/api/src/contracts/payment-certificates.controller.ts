import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type CertificateStatus, type PaymentCertificate, type IpcLine, PaymentCertificateService } from '@aura/contracts';

class CreateCertificateDto {
  @IsString() contractId!: string;
  @IsOptional() @IsString() periodStart?: string;
  @IsOptional() @IsString() periodEnd?: string;
  @IsNumber() cumulativeWorkDone!: number;
  @IsOptional() @IsNumber() materialsOnSite?: number;
  @IsOptional() @IsNumber() retentionPercent?: number;
  @IsOptional() @IsNumber() retentionCapPercent?: number;
  @IsOptional() @IsNumber() advanceRecoveredToDate?: number;
  @IsOptional() @IsString() reference?: string;
}

class AddIpcLineDto {
  @IsString() projectId!: string;
  @IsString() boqItemId!: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() rate?: number;
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
    if (!(Number(dto.cumulativeWorkDone) >= 0)) throw new BadRequestException('cumulativeWorkDone must be zero or positive');
    const ctx = this.tenant.get();
    return this.certificates.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      contractId: dto.contractId,
      periodStart: dto.periodStart ?? null,
      periodEnd: dto.periodEnd ?? null,
      cumulativeWorkDone: Number(dto.cumulativeWorkDone),
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

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<PaymentCertificate> {
    const found = await this.certificates.get(id);
    if (!found) throw new NotFoundException(`payment certificate ${id} not found`);
    return found;
  }

  /** Add a valuation line (a BOQ item's certified quantity × rate) to a draft IPC. On certification
   *  each line posts its quantity to the Quantity Ledger as the item's INVOICED position. */
  @Post(':id/lines')
  addLine(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AddIpcLineDto): Promise<IpcLine> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.boqItemId) throw new BadRequestException('boqItemId is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!(Number(dto.quantity) > 0)) throw new BadRequestException('quantity must be positive');
    return this.certificates.addLine({
      certificateId: id,
      projectId: dto.projectId,
      boqItemId: dto.boqItemId,
      description: dto.description,
      quantity: Number(dto.quantity),
      unit: dto.unit ?? null,
      rate: dto.rate,
    });
  }

  @Get(':id/lines')
  listLines(@Param('id', ParseUuidOr404Pipe) id: string): Promise<IpcLine[]> {
    return this.certificates.listLines(id, this.tenant.get().tenantId);
  }

  @Patch(':id/status')
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
