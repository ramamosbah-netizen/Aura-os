import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { ELV_DEVICE_STATUSES, type ElvDevice, type ElvDeviceStatus, ElvDeviceService } from '@aura/elv';

class RegisterDeviceDto {
  @IsString() projectId!: string;
  @IsString() tag!: string;
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() drawingRef?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() macAddress?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() cableRef?: string;
  @IsOptional() @IsString() homeRunTo?: string;
  @IsOptional() @IsString() portRef?: string;
  @IsOptional() @IsString() warrantyExpiresAt?: string;
  @IsOptional() @IsString() notes?: string;
}

class PatchDeviceDto {
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() drawingRef?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() macAddress?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() cableRef?: string;
  @IsOptional() @IsString() homeRunTo?: string;
  @IsOptional() @IsString() portRef?: string;
  @IsOptional() @IsString() warrantyExpiresAt?: string;
  @IsOptional() @IsString() notes?: string;
}

class StatusDto {
  @IsIn(ELV_DEVICE_STATUSES as unknown as string[]) status!: ElvDeviceStatus;
}

class LinkCommissioningDto {
  @IsString() commissioningRecordId!: string;
}

/**
 * ELV device register API (G-21 / G-23).
 *
 * The device schedule and the cable schedule are both views over this one collection — filter by
 * system for the first, read the cable/port fields for the second. Building them as two endpoints
 * is how you end up with two lists that disagree.
 *
 * Domain guards throw plain Errors classified by the global taxonomy (404 not-found,
 * 409 already/only-can, 400 required), so no 500 leaks.
 */
@Controller('elv/devices')
export class ElvDevicesController {
  constructor(
    private readonly service: ElvDeviceService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  register(@Body() dto: RegisterDeviceDto): Promise<ElvDevice> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.tag?.trim()) throw new BadRequestException('tag is required');
    const ctx = this.tenant.get();
    return this.service.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      tag: dto.tag,
      system: dto.system,
      model: dto.model ?? null,
      manufacturer: dto.manufacturer ?? null,
      location: dto.location ?? null,
      drawingRef: dto.drawingRef ?? null,
      serialNumber: dto.serialNumber ?? null,
      macAddress: dto.macAddress ?? null,
      ipAddress: dto.ipAddress ?? null,
      cableRef: dto.cableRef ?? null,
      homeRunTo: dto.homeRunTo ?? null,
      portRef: dto.portRef ?? null,
      warrantyExpiresAt: dto.warrantyExpiresAt ?? null,
      notes: dto.notes ?? null,
      createdBy: ctx.actorId,
    });
  }

  /** The device schedule. `?system=` narrows it; `?status=` gives the install/test progress view. */
  @Get()
  list(
    @Query('projectId') projectId?: string,
    @Query('system') system?: string,
    @Query('status') status?: string,
  ): Promise<ElvDevice[]> {
    return this.service.list(this.tenant.get().tenantId, { projectId, system, status });
  }

  @Get('paged')
  paged(
    @Query('projectId') projectId?: string,
    @Query('system') system?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.listPaged(this.tenant.get().tenantId, parsePageParams({ limit, offset }), {
      projectId,
      system,
      status,
    });
  }

  /**
   * What stands between this project and a handover the client will sign. Counts devices that
   * work-but-are-undocumented separately from those not yet commissioned — different jobs, for
   * different people.
   */
  @Get('punch-list')
  punchList(@Query('projectId') projectId?: string) {
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.service.handoverPunchList(this.tenant.get().tenantId, projectId);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<ElvDevice> {
    const device = await this.service.get(id, this.tenant.get().tenantId);
    if (!device) throw new NotFoundException(`device ${id} not found`);
    return device;
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() dto: PatchDeviceDto): Promise<ElvDevice> {
    return this.service.patch(id, this.tenant.get().tenantId, dto);
  }

  @Put(':id/status')
  changeStatus(@Param('id') id: string, @Body() dto: StatusDto): Promise<ElvDevice> {
    return this.service.changeStatus(id, this.tenant.get().tenantId, dto.status);
  }

  @Put(':id/commissioning')
  link(@Param('id') id: string, @Body() dto: LinkCommissioningDto): Promise<ElvDevice> {
    if (!dto?.commissioningRecordId) throw new BadRequestException('commissioningRecordId is required');
    return this.service.linkCommissioning(id, this.tenant.get().tenantId, dto.commissioningRecordId);
  }
}
