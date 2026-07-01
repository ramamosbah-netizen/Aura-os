import type { TxHandle } from '@aura/core';
import type { Vehicle } from './domain/vehicle';
import type { FuelLog } from './domain/fuel-log';
import type { MaintenanceRecord } from './domain/maintenance';
import type { TrafficFine } from './domain/traffic-fine';
import type { SalikCharge } from './domain/salik-charge';
import type { VehicleTelemetry } from './domain/telemetry';
import { type Page, type PageParams, paginate } from '@aura/shared';
import type { VehicleStore, FuelLogStore, MaintenanceStore, TrafficFineStore, SalikChargeStore, TelemetryStore, VehicleFilter } from './store.interface';

export class InMemoryVehicleStore implements VehicleStore {
  private items = new Map<string, Vehicle>();

  async save(vehicle: Vehicle, tx?: TxHandle): Promise<Vehicle> {
    const copy = { ...vehicle, updatedAt: new Date().toISOString() };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<Vehicle | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<Vehicle[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listPaged(filter: VehicleFilter, page: PageParams): Promise<Page<Vehicle>> {
    let all = Array.from(this.items.values());
    if (filter.tenantId) {
      all = all.filter((item) => item.tenantId === filter.tenantId);
    }
    if (filter.status) {
      all = all.filter((item) => item.status === filter.status);
    }
    if (filter.make) {
      all = all.filter((item) => item.make.toLowerCase() === filter.make!.toLowerCase());
    }
    if (filter.model) {
      all = all.filter((item) => item.model.toLowerCase() === filter.model!.toLowerCase());
    }
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paginate(all, page);
  }

  async delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;
    return this.items.delete(id);
  }
}

export class InMemoryFuelLogStore implements FuelLogStore {
  private items = new Map<string, FuelLog>();

  async save(log: FuelLog, tx?: TxHandle): Promise<FuelLog> {
    const copy = { ...log, updatedAt: new Date().toISOString() };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<FuelLog | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<FuelLog[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByVehicle(tenantId: string, vehicleId: string): Promise<FuelLog[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId && item.vehicleId === vehicleId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;
    return this.items.delete(id);
  }
}

export class InMemoryMaintenanceStore implements MaintenanceStore {
  private items = new Map<string, MaintenanceRecord>();

  async save(record: MaintenanceRecord, tx?: TxHandle): Promise<MaintenanceRecord> {
    const copy = { ...record, updatedAt: new Date().toISOString() };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<MaintenanceRecord | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<MaintenanceRecord[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByVehicle(tenantId: string, vehicleId: string): Promise<MaintenanceRecord[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId && item.vehicleId === vehicleId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;
    return this.items.delete(id);
  }
}

export class InMemoryTrafficFineStore implements TrafficFineStore {
  private items = new Map<string, TrafficFine>();

  async save(fine: TrafficFine, tx?: TxHandle): Promise<TrafficFine> {
    const copy = { ...fine, updatedAt: new Date().toISOString() };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<TrafficFine | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<TrafficFine[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByVehicle(tenantId: string, vehicleId: string): Promise<TrafficFine[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId && item.vehicleId === vehicleId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemorySalikChargeStore implements SalikChargeStore {
  private items = new Map<string, SalikCharge>();

  async save(charge: SalikCharge, tx?: TxHandle): Promise<SalikCharge> {
    const copy = { ...charge, updatedAt: new Date().toISOString() };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<SalikCharge | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<SalikCharge[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByVehicle(tenantId: string, vehicleId: string): Promise<SalikCharge[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId && item.vehicleId === vehicleId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryTelemetryStore implements TelemetryStore {
  private items = new Map<string, VehicleTelemetry>();

  async save(telemetry: VehicleTelemetry, tx?: TxHandle): Promise<VehicleTelemetry> {
    const copy = { ...telemetry };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findByVehicle(tenantId: string, vehicleId: string): Promise<VehicleTelemetry[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId && item.vehicleId === vehicleId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }

  async findByTenant(tenantId: string): Promise<VehicleTelemetry[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }
}
