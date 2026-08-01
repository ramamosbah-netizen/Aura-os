import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { TenantContext } from '@aura/core';
import { type StorageLocation, type LocationType, StorageLocationService } from '@aura/inventory';

class CreateLocationDto {
  @IsString() warehouse!: string;
  @IsString() binCode!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() type?: LocationType;
}
class ActiveDto {
  @IsBoolean() active!: boolean;
}

/** Warehouse/bin storage-location master. */
@Controller('inventory/locations')
export class LocationsController {
  constructor(
    private readonly service: StorageLocationService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateLocationDto): Promise<StorageLocation> {
    if (!dto?.warehouse?.trim()) throw new BadRequestException('warehouse is required');
    if (!dto?.binCode?.trim()) throw new BadRequestException('binCode is required');
    const ctx = this.tenant.get();
    return this.service.create({
      tenantId: ctx.tenantId, companyId: ctx.companyId, warehouse: dto.warehouse,
      binCode: dto.binCode, description: dto.description ?? null, type: dto.type, createdBy: ctx.actorId,
    });
  }

  @Get()
  list(@Query('warehouse') warehouse?: string, @Query('active') active?: string): Promise<StorageLocation[]> {
    const activeFilter = active === undefined ? undefined : active === 'true';
    return this.service.list(this.tenant.get().tenantId, { warehouse, active: activeFilter });
  }

  @Put(':id/active')
  setActive(@Param('id') id: string, @Body() dto: ActiveDto): Promise<StorageLocation> {
    return this.service.setActive(id, this.tenant.get().tenantId, !!dto.active);
  }
}
