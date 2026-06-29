import type { TxHandle } from '@aura/core';
import type { Vehicle } from './domain/vehicle';
import type { FuelLog } from './domain/fuel-log';
import type { MaintenanceRecord } from './domain/maintenance';
import type { TrafficFine } from './domain/traffic-fine';

export interface VehicleStore {
  save(vehicle: Vehicle, tx?: TxHandle): Promise<Vehicle>;
  findById(tenantId: string, id: string): Promise<Vehicle | null>;
  findByTenant(tenantId: string): Promise<Vehicle[]>;
  delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean>;
}

export interface FuelLogStore {
  save(log: FuelLog, tx?: TxHandle): Promise<FuelLog>;
  findById(tenantId: string, id: string): Promise<FuelLog | null>;
  findByTenant(tenantId: string): Promise<FuelLog[]>;
  findByVehicle(tenantId: string, vehicleId: string): Promise<FuelLog[]>;
  delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean>;
}

export interface MaintenanceStore {
  save(record: MaintenanceRecord, tx?: TxHandle): Promise<MaintenanceRecord>;
  findById(tenantId: string, id: string): Promise<MaintenanceRecord | null>;
  findByTenant(tenantId: string): Promise<MaintenanceRecord[]>;
  findByVehicle(tenantId: string, vehicleId: string): Promise<MaintenanceRecord[]>;
  delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean>;
}

export interface TrafficFineStore {
  save(fine: TrafficFine, tx?: TxHandle): Promise<TrafficFine>;
  findById(tenantId: string, id: string): Promise<TrafficFine | null>;
  findByTenant(tenantId: string): Promise<TrafficFine[]>;
  findByVehicle(tenantId: string, vehicleId: string): Promise<TrafficFine[]>;
}
