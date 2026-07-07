import type { TxHandle } from '@aura/core';
import type { Vehicle } from './domain/vehicle';
import type { FuelLog } from './domain/fuel-log';
import type { MaintenanceRecord } from './domain/maintenance';
import type { TrafficFine } from './domain/traffic-fine';
import type { SalikCharge } from './domain/salik-charge';
import type { VehicleTelemetry } from './domain/telemetry';
import type { Page, PageParams } from '@aura/shared';

export interface VehicleFilter {
  tenantId?: string;
  status?: string;
  make?: string;
  model?: string;
}

export interface FuelLogFilter {
  tenantId?: string;
  vehicleId?: string;
}

export interface MaintenanceFilter {
  tenantId?: string;
  vehicleId?: string;
  status?: string;
}

export interface TrafficFineFilter {
  tenantId?: string;
  vehicleId?: string;
  status?: string;
}

export interface SalikChargeFilter {
  tenantId?: string;
  vehicleId?: string;
  status?: string;
}

export interface VehicleStore {
  save(vehicle: Vehicle, tx?: TxHandle): Promise<Vehicle>;
  findById(tenantId: string, id: string): Promise<Vehicle | null>;
  findByTenant(tenantId: string): Promise<Vehicle[]>;
  listPaged(filter: VehicleFilter, page: PageParams): Promise<Page<Vehicle>>;
  /** Soft-delete flag: true hides the vehicle from finds; false restores. */
  setDeleted(tenantId: string, id: string, deleted: boolean, tx?: TxHandle): Promise<boolean>;
}

export interface FuelLogStore {
  save(log: FuelLog, tx?: TxHandle): Promise<FuelLog>;
  findById(tenantId: string, id: string): Promise<FuelLog | null>;
  findByTenant(tenantId: string): Promise<FuelLog[]>;
  findByVehicle(tenantId: string, vehicleId: string): Promise<FuelLog[]>;
  listPaged(filter: FuelLogFilter, page: PageParams): Promise<Page<FuelLog>>;
  delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean>;
}

export interface MaintenanceStore {
  save(record: MaintenanceRecord, tx?: TxHandle): Promise<MaintenanceRecord>;
  findById(tenantId: string, id: string): Promise<MaintenanceRecord | null>;
  findByTenant(tenantId: string): Promise<MaintenanceRecord[]>;
  findByVehicle(tenantId: string, vehicleId: string): Promise<MaintenanceRecord[]>;
  listPaged(filter: MaintenanceFilter, page: PageParams): Promise<Page<MaintenanceRecord>>;
  delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean>;
}

export interface TrafficFineStore {
  save(fine: TrafficFine, tx?: TxHandle): Promise<TrafficFine>;
  findById(tenantId: string, id: string): Promise<TrafficFine | null>;
  findByTenant(tenantId: string): Promise<TrafficFine[]>;
  findByVehicle(tenantId: string, vehicleId: string): Promise<TrafficFine[]>;
  listPaged(filter: TrafficFineFilter, page: PageParams): Promise<Page<TrafficFine>>;
}

export interface SalikChargeStore {
  save(charge: SalikCharge, tx?: TxHandle): Promise<SalikCharge>;
  findById(tenantId: string, id: string): Promise<SalikCharge | null>;
  findByTenant(tenantId: string): Promise<SalikCharge[]>;
  findByVehicle(tenantId: string, vehicleId: string): Promise<SalikCharge[]>;
  listPaged(filter: SalikChargeFilter, page: PageParams): Promise<Page<SalikCharge>>;
}

export interface TelemetryStore {
  save(telemetry: VehicleTelemetry, tx?: TxHandle): Promise<VehicleTelemetry>;
  findByVehicle(tenantId: string, vehicleId: string): Promise<VehicleTelemetry[]>;
  findByTenant(tenantId: string): Promise<VehicleTelemetry[]>;
}
