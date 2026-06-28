import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Vehicle,
  type FuelLog,
  type MaintenanceRecord,
  FleetService,
} from '@aura/fleet';

interface CreateVehicleDto {
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  registrationExpiry?: string | null;
  status?: Vehicle['status'];
  driverEmployeeId?: string | null;
}

interface LogFuelDto {
  vehicleId: string;
  date: string;
  liters: number;
  cost: number;
  odometer: number;
}

interface ScheduleMaintenanceDto {
  vehicleId: string;
  date: string;
  description: string;
  cost?: number;
}

interface CompleteMaintenanceDto {
  actualCost: number;
}

@Controller('fleet')
export class FleetController {
  constructor(
    private readonly fleetService: FleetService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Vehicles ──────────────────────────────────────────────────────────────

  @Post('vehicles')
  createVehicle(@Body() dto: CreateVehicleDto): Promise<Vehicle> {
    if (!dto?.make?.trim()) throw new BadRequestException('make is required');
    if (!dto?.model?.trim()) throw new BadRequestException('model is required');
    if (!dto?.year) throw new BadRequestException('year is required');
    if (!dto?.plateNumber?.trim()) throw new BadRequestException('plateNumber is required');

    const ctx = this.tenant.get();
    return this.fleetService.createVehicle(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      make: dto.make,
      model: dto.model,
      year: Number(dto.year),
      plateNumber: dto.plateNumber,
      registrationExpiry: dto.registrationExpiry,
      status: dto.status,
      driverEmployeeId: dto.driverEmployeeId,
    });
  }

  @Delete('vehicles/:id')
  async deleteVehicle(@Param('id') id: string): Promise<{ success: boolean }> {
    const ctx = this.tenant.get();
    const success = await this.fleetService.deleteVehicle(ctx.tenantId, ctx.actorId, id);
    return { success };
  }

  @Get('vehicles')
  listVehicles(): Promise<Vehicle[]> {
    const ctx = this.tenant.get();
    return this.fleetService.listVehicles(ctx.tenantId);
  }

  // ── Fuel Logs ─────────────────────────────────────────────────────────────

  @Post('fuel')
  logFuel(@Body() dto: LogFuelDto): Promise<FuelLog> {
    if (!dto?.vehicleId) throw new BadRequestException('vehicleId is required');
    if (!dto?.date?.trim()) throw new BadRequestException('date is required');
    if (dto.liters === undefined || dto.liters <= 0) throw new BadRequestException('liters must be > 0');
    if (dto.cost === undefined || dto.cost <= 0) throw new BadRequestException('cost must be > 0');
    if (dto.odometer === undefined || dto.odometer < 0) throw new BadRequestException('odometer must be >= 0');

    const ctx = this.tenant.get();
    return this.fleetService.logFuel(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      vehicleId: dto.vehicleId,
      date: dto.date,
      liters: Number(dto.liters),
      cost: Number(dto.cost),
      odometer: Number(dto.odometer),
    });
  }

  @Get('fuel')
  listFuelLogs(): Promise<FuelLog[]> {
    const ctx = this.tenant.get();
    return this.fleetService.listFuelLogs(ctx.tenantId);
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  @Post('maintenance')
  scheduleMaintenance(@Body() dto: ScheduleMaintenanceDto): Promise<MaintenanceRecord> {
    if (!dto?.vehicleId) throw new BadRequestException('vehicleId is required');
    if (!dto?.date?.trim()) throw new BadRequestException('date is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');

    const ctx = this.tenant.get();
    return this.fleetService.scheduleMaintenance(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      vehicleId: dto.vehicleId,
      date: dto.date,
      description: dto.description,
      cost: dto.cost !== undefined ? Number(dto.cost) : undefined,
    });
  }

  @Put('maintenance/:id/complete')
  completeMaintenance(
    @Param('id') id: string,
    @Body() dto: CompleteMaintenanceDto,
  ): Promise<MaintenanceRecord> {
    if (dto?.actualCost === undefined || dto.actualCost < 0) {
      throw new BadRequestException('actualCost must be >= 0');
    }

    const ctx = this.tenant.get();
    return this.fleetService.completeMaintenance(ctx.tenantId, ctx.actorId, id, Number(dto.actualCost));
  }

  @Get('maintenance')
  listMaintenance(): Promise<MaintenanceRecord[]> {
    const ctx = this.tenant.get();
    return this.fleetService.listMaintenance(ctx.tenantId);
  }
}
