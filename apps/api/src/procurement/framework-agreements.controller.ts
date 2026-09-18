import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { Permissions, TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type FrameworkAgreement,
  type FrameworkAgreementStatus,
  type FrameworkRateItem,
  FrameworkAgreementService,
} from '@aura/procurement';

class CreateFrameworkAgreementDto {
  @IsString() title!: string;
  @IsString() supplierId!: string;
  @IsString() validFrom!: string; // YYYY-MM-DD
  @IsString() validTo!: string;
  @IsNumber() ceilingValue!: number;
  @IsOptional() @IsArray() items?: FrameworkRateItem[];
  @IsOptional() @IsString() notes?: string;
}

class CallOffDto {
  @IsString() title!: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() projectName?: string;
  @IsNumber() value!: number;
}

/**
 * Framework agreements (blanket POs + call-offs) API — delegates to FrameworkAgreementService.
 *
 * EVERY HANDLER HERE USED TO WRAP ITS SERVICE CALL IN `try { … } catch { throw new
 * BadRequestException(err.message) }`. That is the per-route try/catch→400 boilerplate the global
 * `AllExceptionsFilter` exists to remove, and it did more than add noise: it flattened EVERY domain
 * refusal to 400, so "the person who created this agreement may not activate their own" — a
 * separation-of-duties refusal the taxonomy classifies 403 — reached the client as bad input. The
 * message survived; the status lied. The wrappers are gone and the filter classifies.
 */
@Controller('procurement/framework-agreements')
export class FrameworkAgreementsController {
  constructor(
    private readonly agreements: FrameworkAgreementService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  @Permissions('procurement.framework-agreement.create')
  async create(@Body() dto: CreateFrameworkAgreementDto): Promise<FrameworkAgreement> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.supplierId) throw new BadRequestException('supplierId is required');
    if (!dto?.validFrom || !dto?.validTo) throw new BadRequestException('validFrom and validTo are required');
    if (dto?.ceilingValue === undefined) throw new BadRequestException('ceilingValue is required');
    const ctx = this.tenant.get();
    return await this.agreements.create({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        title: dto.title,
        supplierId: dto.supplierId,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        ceilingValue: dto.ceilingValue,
        items: dto.items,
        notes: dto.notes ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  @Permissions('procurement.framework-agreement.read')
  list(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: FrameworkAgreementStatus,
  ): Promise<FrameworkAgreement[]> {
    return this.agreements.list({ tenantId: this.tenant.get().tenantId, supplierId, status, limit: 100 });
  }

  @Get('paged')
  @Permissions('procurement.framework-agreement.read')
  paged(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: FrameworkAgreementStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.agreements.listPaged(
      { tenantId: this.tenant.get().tenantId, supplierId, status },
      parsePageParams(limit, offset),
    );
  }

  /**
   * ACTIVATE it — the business is now committed to this supplier up to the agreement's ceiling.
   * Its own permission, held by the Procurement Manager and not by the Buyer who negotiated it, and
   * the actor finally reaches the service: the `activated` event carried `actorId: null`.
   */
  @Post(':id/activate')
  @Permissions('procurement.framework-agreement.activate')
  async activate(@Param('id') id: string): Promise<FrameworkAgreement> {
    return await this.agreements.activate(id, this.tenant.get().actorId ?? null);
  }

  @Post(':id/terminate')
  @Permissions('procurement.framework-agreement.terminate')
  async terminate(@Param('id') id: string): Promise<FrameworkAgreement> {
    return await this.agreements.terminate(id, this.tenant.get().actorId ?? null);
  }

  @Post(':id/call-offs')
  @Permissions('procurement.framework-agreement.call-offs')
  async callOff(@Param('id') id: string, @Body() dto: CallOffDto) {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (dto?.value === undefined) throw new BadRequestException('value is required');
    const ctx = this.tenant.get();
    return await this.agreements.callOff(id, {
      title: dto.title,
      projectId: dto.projectId ?? null,
      projectName: dto.projectName ?? null,
      value: dto.value,
      createdBy: ctx.actorId,
    });
  }

  @Get(':id')
  @Permissions('procurement.framework-agreement.read')
  async get(@Param('id') id: string): Promise<FrameworkAgreement> {
    const found = await this.agreements.get(id);
    if (!found) throw new NotFoundException(`framework agreement ${id} not found`);
    return found;
  }
}
