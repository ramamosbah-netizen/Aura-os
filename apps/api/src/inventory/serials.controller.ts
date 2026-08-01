import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantContext } from '@aura/core';
import { type SerialUnit, SerialService } from '@aura/inventory';

class RegisterSerialDto {
  @IsString() serialNumber!: string;
  @IsString() itemCode!: string;
  @IsString() itemName!: string;
  @IsOptional() @IsString() warehouse?: string;
  @IsOptional() @IsString() grnId?: string;
}
class IssueDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
}
class InstallDto {
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsInt() @Min(0) warrantyMonths?: number;
  @IsOptional() @IsString() warrantyStartDate?: string;
}
class FaultDto {
  @IsString() reason!: string;
}

/**
 * Serialised inventory API — the per-unit device ledger. Register a serial (on receipt),
 * then issue → install (with warranty) → return / fault. Domain guards throw plain Errors
 * classified by the global taxonomy (404 / 409 / 400).
 */
@Controller('inventory/serials')
export class SerialsController {
  constructor(
    private readonly service: SerialService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  register(@Body() dto: RegisterSerialDto): Promise<SerialUnit> {
    if (!dto?.serialNumber?.trim()) throw new BadRequestException('serialNumber is required');
    if (!dto?.itemCode?.trim()) throw new BadRequestException('itemCode is required');
    if (!dto?.itemName?.trim()) throw new BadRequestException('itemName is required');
    const ctx = this.tenant.get();
    return this.service.register({
      tenantId: ctx.tenantId, companyId: ctx.companyId, serialNumber: dto.serialNumber,
      itemCode: dto.itemCode, itemName: dto.itemName, warehouse: dto.warehouse ?? null,
      grnId: dto.grnId ?? null, createdBy: ctx.actorId,
    });
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('itemCode') itemCode?: string,
  ): Promise<SerialUnit[]> {
    return this.service.list(this.tenant.get().tenantId, { status, projectId, itemCode });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<SerialUnit> {
    const found = await this.service.get(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`serial unit ${id} not found`);
    return found;
  }

  @Put(':id/issue')
  issue(@Param('id') id: string, @Body() dto: IssueDto): Promise<SerialUnit> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    return this.service.issue(id, this.tenant.get().tenantId, { projectId: dto.projectId, projectName: dto.projectName ?? null });
  }

  @Put(':id/install')
  install(@Param('id') id: string, @Body() dto: InstallDto): Promise<SerialUnit> {
    return this.service.install(id, this.tenant.get().tenantId, {
      location: dto.location ?? null, warrantyMonths: dto.warrantyMonths, warrantyStartDate: dto.warrantyStartDate,
    });
  }

  @Put(':id/return')
  returnToStock(@Param('id') id: string): Promise<SerialUnit> {
    return this.service.returnToStock(id, this.tenant.get().tenantId);
  }

  @Put(':id/fault')
  fault(@Param('id') id: string, @Body() dto: FaultDto): Promise<SerialUnit> {
    if (!dto?.reason?.trim()) throw new BadRequestException('reason is required');
    return this.service.markFaulty(id, this.tenant.get().tenantId, dto.reason);
  }
}
