import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type FrameworkAgreement,
  type FrameworkAgreementStatus,
  type FrameworkRateItem,
  FrameworkAgreementService,
} from '@aura/procurement';

interface CreateFrameworkAgreementDto {
  title: string;
  supplierId: string;
  validFrom: string; // YYYY-MM-DD
  validTo: string;
  ceilingValue: number;
  items?: FrameworkRateItem[];
  notes?: string;
}

interface CallOffDto {
  title: string;
  projectId?: string;
  projectName?: string;
  value: number;
}

/** Framework agreements (blanket POs + call-offs) API — delegates to FrameworkAgreementService. */
@Controller('procurement/framework-agreements')
export class FrameworkAgreementsController {
  constructor(
    private readonly agreements: FrameworkAgreementService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  async create(@Body() dto: CreateFrameworkAgreementDto): Promise<FrameworkAgreement> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.supplierId) throw new BadRequestException('supplierId is required');
    if (!dto?.validFrom || !dto?.validTo) throw new BadRequestException('validFrom and validTo are required');
    if (dto?.ceilingValue === undefined) throw new BadRequestException('ceilingValue is required');
    const ctx = this.tenant.get();
    try {
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
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'framework agreement create failed');
    }
  }

  @Get()
  list(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: FrameworkAgreementStatus,
  ): Promise<FrameworkAgreement[]> {
    return this.agreements.list({ tenantId: this.tenant.get().tenantId, supplierId, status, limit: 100 });
  }

  @Get('paged')
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

  @Post(':id/activate')
  async activate(@Param('id') id: string): Promise<FrameworkAgreement> {
    try {
      return await this.agreements.activate(id);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'activate failed');
    }
  }

  @Post(':id/terminate')
  async terminate(@Param('id') id: string): Promise<FrameworkAgreement> {
    try {
      return await this.agreements.terminate(id);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'terminate failed');
    }
  }

  @Post(':id/call-offs')
  async callOff(@Param('id') id: string, @Body() dto: CallOffDto) {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (dto?.value === undefined) throw new BadRequestException('value is required');
    const ctx = this.tenant.get();
    try {
      return await this.agreements.callOff(id, {
        title: dto.title,
        projectId: dto.projectId ?? null,
        projectName: dto.projectName ?? null,
        value: dto.value,
        createdBy: ctx.actorId,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'call-off failed');
    }
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<FrameworkAgreement> {
    const found = await this.agreements.get(id);
    if (!found) throw new NotFoundException(`framework agreement ${id} not found`);
    return found;
  }
}
