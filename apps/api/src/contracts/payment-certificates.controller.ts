import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { type CertificateStatus, type PaymentCertificate, PaymentCertificateService } from '@aura/contracts';

interface CreateCertificateDto {
  contractId: string;
  periodStart?: string;
  periodEnd?: string;
  cumulativeWorkDone: number;
  materialsOnSite?: number;
  retentionPercent?: number;
  retentionCapPercent?: number;
  advanceRecoveredToDate?: number;
  reference?: string;
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
    try {
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
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get()
  list(@Query('contractId') contractId?: string, @Query('status') status?: string): Promise<PaymentCertificate[]> {
    const ctx = this.tenant.get();
    return this.certificates.list({ tenantId: ctx.tenantId, contractId, status, limit: 200 });
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
