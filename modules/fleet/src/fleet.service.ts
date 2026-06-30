import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Vehicle, makeVehicle } from './domain/vehicle';
import { type FuelLog, makeFuelLog } from './domain/fuel-log';
import { type MaintenanceRecord, makeMaintenanceRecord } from './domain/maintenance';
import { type TrafficFine, makeTrafficFine, assignFine, disputeFine, payFine } from './domain/traffic-fine';
import { type SalikCharge, type NewSalikCharge, type SalikSummary, makeSalikCharge, allocateSalik, disputeSalik, summariseSalik } from './domain/salik-charge';
import { type VehicleStore, type FuelLogStore, type MaintenanceStore, type TrafficFineStore, type SalikChargeStore } from './store.interface';

export const VEHICLE_STORE = Symbol('VEHICLE_STORE');
export const FUEL_LOG_STORE = Symbol('FUEL_LOG_STORE');
export const MAINTENANCE_STORE = Symbol('MAINTENANCE_STORE');
export const TRAFFIC_FINE_STORE = Symbol('TRAFFIC_FINE_STORE');
export const SALIK_CHARGE_STORE = Symbol('SALIK_CHARGE_STORE');

export const FLEET_EVENT = {
  vehicleCreated: 'fleet.vehicle.created',
  fuelLogged: 'fleet.fuel.logged',
  maintenanceScheduled: 'fleet.maintenance.scheduled',
  maintenanceCompleted: 'fleet.maintenance.completed',
  fineRecorded: 'fleet.fine.recorded',
  fineAssigned: 'fleet.fine.assigned',
  finePaid: 'fleet.fine.paid',
  salikRecorded: 'fleet.salik.recorded',
  salikAllocated: 'fleet.salik.allocated',
  salikDisputed: 'fleet.salik.disputed',
};

@Injectable()
export class FleetService {
  private readonly logger = new Logger('FleetControl');

  constructor(
    @Inject(VEHICLE_STORE) private readonly vehicleStore: VehicleStore,
    @Inject(FUEL_LOG_STORE) private readonly fuelLogStore: FuelLogStore,
    @Inject(MAINTENANCE_STORE) private readonly maintenanceStore: MaintenanceStore,
    @Inject(TRAFFIC_FINE_STORE) private readonly trafficFineStore: TrafficFineStore,
    @Inject(SALIK_CHARGE_STORE) private readonly salikStore: SalikChargeStore,
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

  // ── Traffic Fines ─────────────────────────────────────────────────────────

  async recordFine(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      vehicleId: string;
      fineNumber: string;
      violation: string;
      location?: string;
      amount: number;
      blackPoints?: number;
      fineDate: string;
    },
  ): Promise<TrafficFine> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'fleet.fine.create', orgPath });
    }

    const fine = makeTrafficFine(input);
    const event = makeEvent({
      type: FLEET_EVENT.fineRecorded,
      tenantId: fine.tenantId,
      companyId: fine.companyId,
      actorId,
      aggregateType: 'fleet.traffic_fine',
      aggregateId: fine.id,
      payload: { vehicleId: fine.vehicleId, fineNumber: fine.fineNumber, amount: fine.amount, blackPoints: fine.blackPoints },
    });

    await this.tx.run(async (handle) => {
      await this.trafficFineStore.save(fine, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Traffic fine ${fine.fineNumber} recorded for vehicle ${fine.vehicleId}: ${fine.amount} AED, ${fine.blackPoints} pts`);
    return fine;
  }

  async assignFineToDriver(tenantId: string, id: string, driverEmployeeId: string): Promise<TrafficFine> {
    const fine = await this.trafficFineStore.findById(tenantId, id);
    if (!fine) throw new Error(`traffic fine ${id} not found`);
    const updated = assignFine(fine, driverEmployeeId);
    const event = makeEvent({
      type: FLEET_EVENT.fineAssigned,
      tenantId, companyId: fine.companyId, actorId: null,
      aggregateType: 'fleet.traffic_fine', aggregateId: id,
      payload: { driverEmployeeId, amount: fine.amount },
    });
    await this.tx.run(async (handle) => {
      await this.trafficFineStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  async disputeFine(tenantId: string, id: string): Promise<TrafficFine> {
    const fine = await this.trafficFineStore.findById(tenantId, id);
    if (!fine) throw new Error(`traffic fine ${id} not found`);
    const updated = disputeFine(fine);
    await this.trafficFineStore.save(updated);
    return updated;
  }

  async payFine(tenantId: string, id: string, paidDate?: string): Promise<TrafficFine> {
    const fine = await this.trafficFineStore.findById(tenantId, id);
    if (!fine) throw new Error(`traffic fine ${id} not found`);
    const updated = payFine(fine, paidDate);
    const event = makeEvent({
      type: FLEET_EVENT.finePaid,
      tenantId, companyId: fine.companyId, actorId: null,
      aggregateType: 'fleet.traffic_fine', aggregateId: id,
      payload: { amount: fine.amount, paidDate: updated.paidDate },
    });
    await this.tx.run(async (handle) => {
      await this.trafficFineStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  listFines(tenantId: string): Promise<TrafficFine[]> {
    return this.trafficFineStore.findByTenant(tenantId);
  }

  // ── Salik (toll charges) ──────────────────────────────────────────────────

  async recordSalik(input: NewSalikCharge): Promise<SalikCharge> {
    const charge = makeSalikCharge(input);
    const event = makeEvent({
      type: FLEET_EVENT.salikRecorded,
      tenantId: charge.tenantId, companyId: charge.companyId, actorId: null,
      aggregateType: 'fleet.salik', aggregateId: charge.id,
      payload: { vehicleId: charge.vehicleId, gate: charge.gate, amount: charge.amount, chargeDate: charge.chargeDate },
    });
    await this.tx.run(async (handle) => {
      await this.salikStore.save(charge, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Salik recorded: ${charge.gate} ${charge.amount} AED (vehicle ${charge.vehicleId})`);
    return charge;
  }

  async allocateSalik(tenantId: string, id: string, allocatedTo: string): Promise<SalikCharge> {
    const charge = await this.salikStore.findById(tenantId, id);
    if (!charge) throw new Error(`salik charge ${id} not found`);
    const updated = allocateSalik(charge, allocatedTo);
    const event = makeEvent({
      type: FLEET_EVENT.salikAllocated,
      tenantId, companyId: charge.companyId, actorId: null,
      aggregateType: 'fleet.salik', aggregateId: id,
      payload: { allocatedTo: updated.allocatedTo, amount: charge.amount },
    });
    await this.tx.run(async (handle) => {
      await this.salikStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  async disputeSalik(tenantId: string, id: string): Promise<SalikCharge> {
    const charge = await this.salikStore.findById(tenantId, id);
    if (!charge) throw new Error(`salik charge ${id} not found`);
    const updated = disputeSalik(charge);
    await this.salikStore.save(updated);
    return updated;
  }

  listSalik(tenantId: string): Promise<SalikCharge[]> {
    return this.salikStore.findByTenant(tenantId);
  }

  async salikSummary(tenantId: string): Promise<SalikSummary> {
    return summariseSalik(await this.salikStore.findByTenant(tenantId));
  }
}
