import type { TxHandle } from '@aura/core';
import type { Vehicle } from './domain/vehicle';
import type { FuelLog } from './domain/fuel-log';
import type { MaintenanceRecord } from './domain/maintenance';
import type { TrafficFine } from './domain/traffic-fine';
import type { VehicleStore, FuelLogStore, MaintenanceStore, TrafficFineStore } from './store.interface';

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
