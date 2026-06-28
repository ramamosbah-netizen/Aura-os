import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Vehicle, makeVehicle } from './domain/vehicle';
import { type FuelLog, makeFuelLog } from './domain/fuel-log';
import { type MaintenanceRecord, makeMaintenanceRecord } from './domain/maintenance';
import { type VehicleStore, type FuelLogStore, type MaintenanceStore } from './store.interface';

export const VEHICLE_STORE = Symbol('VEHICLE_STORE');
export const FUEL_LOG_STORE = Symbol('FUEL_LOG_STORE');
export const MAINTENANCE_STORE = Symbol('MAINTENANCE_STORE');

export const FLEET_EVENT = {
  vehicleCreated: 'fleet.vehicle.created',
  fuelLogged: 'fleet.fuel.logged',
  maintenanceScheduled: 'fleet.maintenance.scheduled',
  maintenanceCompleted: 'fleet.maintenance.completed',
};

@Injectable()
export class FleetService {
  private readonly logger = new Logger('FleetControl');

  constructor(
    @Inject(VEHICLE_STORE) private readonly vehicleStore: VehicleStore,
    @Inject(FUEL_LOG_STORE) private readonly fuelLogStore: FuelLogStore,
    @Inject(MAINTENANCE_STORE) private readonly maintenanceStore: MaintenanceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  // ── Vehicles ──────────────────────────────────────────────────────────────

  async createVehicle(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      make: string;
      model: string;
      year: number;
      plateNumber: string;
      registrationExpiry?: string | null;
      status?: Vehicle['status'];
      driverEmployeeId?: string | null;
    },
  ): Promise<Vehicle> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'fleet.vehicle.create', orgPath });
    }

    const vehicle = makeVehicle(input);
    const event = makeEvent({
      type: FLEET_EVENT.vehicleCreated,
      tenantId: vehicle.tenantId,
      companyId: vehicle.companyId,
      actorId: actorId,
      aggregateType: 'fleet.vehicle',
      aggregateId: vehicle.id,
      payload: { make: vehicle.make, model: vehicle.model, plateNumber: vehicle.plateNumber },
    });

    await this.tx.run(async (handle) => {
      await this.vehicleStore.save(vehicle, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Vehicle created: ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`);
    return vehicle;
  }

  async deleteVehicle(tenantId: string, actorId: string | null, id: string): Promise<boolean> {
    const vehicle = await this.vehicleStore.findById(tenantId, id);
    if (!vehicle) throw new Error(`Vehicle with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (vehicle.companyId) orgPath.push({ level: 'company', id: vehicle.companyId });
      this.access.assert(actorId, { permission: 'fleet.vehicle.delete', orgPath });
    }

    await this.tx.run(async (handle) => {
      await this.vehicleStore.delete(tenantId, id, handle);
    });

    this.logger.log(`Vehicle deleted: ${id}`);
    return true;
  }

  getVehicle(tenantId: string, id: string): Promise<Vehicle | null> {
    return this.vehicleStore.findById(tenantId, id);
  }

  listVehicles(tenantId: string): Promise<Vehicle[]> {
    return this.vehicleStore.findByTenant(tenantId);
  }

  // ── Fuel Logs ─────────────────────────────────────────────────────────────

  async logFuel(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      vehicleId: string;
      date: string;
      liters: number;
      cost: number;
      odometer: number;
    },
  ): Promise<FuelLog> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'fleet.fuel.create', orgPath });
    }

    const log = makeFuelLog(input);
    const event = makeEvent({
      type: FLEET_EVENT.fuelLogged,
      tenantId: log.tenantId,
      companyId: log.companyId,
      actorId: actorId,
      aggregateType: 'fleet.fuel_log',
      aggregateId: log.id,
      payload: { vehicleId: log.vehicleId, liters: log.liters, cost: log.cost },
    });

    await this.tx.run(async (handle) => {
      await this.fuelLogStore.save(log, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Fuel consumption logged for vehicle ${log.vehicleId}: ${log.liters}L, Cost: ${log.cost} AED`);
    return log;
  }

  listFuelLogs(tenantId: string): Promise<FuelLog[]> {
    return this.fuelLogStore.findByTenant(tenantId);
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  async scheduleMaintenance(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      vehicleId: string;
      date: string;
      description: string;
      cost?: number;
    },
  ): Promise<MaintenanceRecord> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'fleet.maintenance.create', orgPath });
    }

    const record = makeMaintenanceRecord({ ...input, status: 'scheduled' });
    const event = makeEvent({
      type: FLEET_EVENT.maintenanceScheduled,
      tenantId: record.tenantId,
      companyId: record.companyId,
      actorId: actorId,
      aggregateType: 'fleet.maintenance',
      aggregateId: record.id,
      payload: { vehicleId: record.vehicleId, date: record.date, description: record.description },
    });

    await this.tx.run(async (handle) => {
      await this.maintenanceStore.save(record, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Maintenance scheduled for vehicle ${record.vehicleId} on ${record.date}: ${record.description}`);
    return record;
  }

  async completeMaintenance(
    tenantId: string,
    actorId: string | null,
    id: string,
    actualCost: number,
  ): Promise<MaintenanceRecord> {
    const record = await this.maintenanceStore.findById(tenantId, id);
    if (!record) throw new Error(`Maintenance record with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (record.companyId) orgPath.push({ level: 'company', id: record.companyId });
      this.access.assert(actorId, { permission: 'fleet.maintenance.update', orgPath });
    }

    record.status = 'completed';
    record.cost = actualCost;
    record.updatedAt = new Date().toISOString();

    const event = makeEvent({
      type: FLEET_EVENT.maintenanceCompleted,
      tenantId: record.tenantId,
      companyId: record.companyId,
      actorId: actorId,
      aggregateType: 'fleet.maintenance',
      aggregateId: record.id,
      payload: { vehicleId: record.vehicleId, cost: actualCost },
    });

    await this.tx.run(async (handle) => {
      await this.maintenanceStore.save(record, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Maintenance completed for record ${id}: Cost ${actualCost} AED`);
    return record;
  }

  listMaintenance(tenantId: string): Promise<MaintenanceRecord[]> {
    return this.maintenanceStore.findByTenant(tenantId);
  }
}
