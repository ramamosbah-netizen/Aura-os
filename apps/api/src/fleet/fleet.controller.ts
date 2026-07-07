import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext } from '@aura/core';
import {
  type Vehicle,
  type FuelLog,
  type MaintenanceRecord,
  type TrafficFine,
  type SalikCharge,
  type SalikSummary,
  type VehicleTelemetry,
  FleetService,
} from '@aura/fleet';

class CreateVehicleDto {
  @IsString() make!: string;
  @IsString() model!: string;
  @IsNumber() year!: number;
  @IsString() plateNumber!: string;
  @IsOptional() @IsString() registrationExpiry?: string | null;
  @IsOptional() @IsString() status?: Vehicle['status'];
  @IsOptional() @IsString() driverEmployeeId?: string | null;
}

class LogFuelDto {
  @IsString() vehicleId!: string;
  @IsString() date!: string;
  @IsNumber() liters!: number;
  @IsNumber() cost!: number;
  @IsNumber() odometer!: number;
}

class ScheduleMaintenanceDto {
  @IsString() vehicleId!: string;
  @IsString() date!: string;
  @IsString() description!: string;
  @IsOptional() @IsNumber() cost?: number;
}

class CompleteMaintenanceDto {
  @IsNumber() actualCost!: number;
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

  @Post('vehicles/:id/restore')
  async restoreVehicle(@Param('id') id: string): Promise<Vehicle> {
    try {
      return await this.fleetService.restoreVehicle(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
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

  // ── Traffic Fines ─────────────────────────────────────────────────────────

  @Post('fines')
  async recordFine(@Body() dto: { vehicleId: string; fineNumber: string; violation: string; location?: string; amount: number; blackPoints?: number; fineDate: string }): Promise<TrafficFine> {
    if (!dto?.vehicleId) throw new BadRequestException('vehicleId is required');
    if (!dto?.fineNumber?.trim()) throw new BadRequestException('fineNumber is required');
    if (!dto?.violation?.trim()) throw new BadRequestException('violation is required');
    if (!dto?.fineDate?.trim()) throw new BadRequestException('fineDate is required');
    const ctx = this.tenant.get();
    return await this.fleetService.recordFine(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      vehicleId: dto.vehicleId,
      fineNumber: dto.fineNumber,
      violation: dto.violation,
      location: dto.location,
      amount: Number(dto.amount),
      blackPoints: dto.blackPoints !== undefined ? Number(dto.blackPoints) : undefined,
      fineDate: dto.fineDate,
    });
  }

  @Get('fines')
  listFines(): Promise<TrafficFine[]> {
    return this.fleetService.listFines(this.tenant.get().tenantId);
  }

  @Put('fines/:id/assign')
  async assignFine(@Param('id') id: string, @Body() dto: { driverEmployeeId: string }): Promise<TrafficFine> {
    if (!dto?.driverEmployeeId) throw new BadRequestException('driverEmployeeId is required');
    return await this.fleetService.assignFineToDriver(this.tenant.get().tenantId, id, dto.driverEmployeeId);
  }

  @Put('fines/:id/dispute')
  async disputeFine(@Param('id') id: string): Promise<TrafficFine> {
    return await this.fleetService.disputeFine(this.tenant.get().tenantId, id);
  }

  @Put('fines/:id/pay')
  async payFine(@Param('id') id: string, @Body() dto: { paidDate?: string }): Promise<TrafficFine> {
    return await this.fleetService.payFine(this.tenant.get().tenantId, id, dto?.paidDate);
  }

  // ── Salik (toll charges) ──────────────────────────────────────────────────

  @Post('salik')
  async recordSalik(@Body() dto: { vehicleId: string; plateNumber?: string; gate: string; chargeDate: string; chargeTime?: string; amount?: number; notes?: string }): Promise<SalikCharge> {
    if (!dto?.vehicleId) throw new BadRequestException('vehicleId is required');
    if (!dto?.gate?.trim()) throw new BadRequestException('gate is required');
    if (!dto?.chargeDate?.trim()) throw new BadRequestException('chargeDate is required');
    const ctx = this.tenant.get();
    return await this.fleetService.recordSalik({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      vehicleId: dto.vehicleId,
      plateNumber: dto.plateNumber,
      gate: dto.gate,
      chargeDate: dto.chargeDate,
      chargeTime: dto.chargeTime,
      amount: dto.amount !== undefined ? Number(dto.amount) : undefined,
      notes: dto.notes,
    });
  }

  @Get('salik')
  listSalik(): Promise<SalikCharge[]> {
    return this.fleetService.listSalik(this.tenant.get().tenantId);
  }

  @Get('salik/summary')
  salikSummary(): Promise<SalikSummary> {
    return this.fleetService.salikSummary(this.tenant.get().tenantId);
  }

  @Put('salik/:id/allocate')
  async allocateSalik(@Param('id') id: string, @Body() dto: { allocatedTo: string }): Promise<SalikCharge> {
    if (!dto?.allocatedTo?.trim()) throw new BadRequestException('allocatedTo is required');
    return await this.fleetService.allocateSalik(this.tenant.get().tenantId, id, dto.allocatedTo);
  }

  @Put('salik/:id/dispute')
  async disputeSalik(@Param('id') id: string): Promise<SalikCharge> {
    return await this.fleetService.disputeSalik(this.tenant.get().tenantId, id);
  }

  // ── GPS Telematics & Expiry Triggers ───────────────────────────────────────

  @Post('telemetry/webhook')
  async recordTelemetry(@Body() dto: { vehicleId: string; latitude: number; longitude: number; speed: number; odometer?: number; recordedAt?: string }): Promise<VehicleTelemetry> {
    if (!dto?.vehicleId) throw new BadRequestException('vehicleId is required');
    if (dto?.latitude === undefined) throw new BadRequestException('latitude is required');
    if (dto?.longitude === undefined) throw new BadRequestException('longitude is required');
    if (dto?.speed === undefined) throw new BadRequestException('speed is required');

    const ctx = this.tenant.get();
    return await this.fleetService.recordTelemetry(ctx.tenantId, {
      vehicleId: dto.vehicleId,
      latitude: Number(dto.latitude),
      longitude: Number(dto.longitude),
      speed: Number(dto.speed),
      odometer: dto.odometer !== undefined ? Number(dto.odometer) : undefined,
      recordedAt: dto.recordedAt,
    });
  }

  @Get('vehicles/:id/telemetry')
  getVehicleTelemetry(@Param('id') id: string): Promise<VehicleTelemetry[]> {
    const ctx = this.tenant.get();
    return this.fleetService.getTelemetryForVehicle(ctx.tenantId, id);
  }

  @Post('vehicles/check-expiry')
  checkExpiryAndTriggerRenewals(): Promise<{ vehicleId: string; plateNumber: string; daysRemaining: number }[]> {
    const ctx = this.tenant.get();
    return this.fleetService.checkRegistrationsAndTriggerRenewals(ctx.tenantId);
  }
}
