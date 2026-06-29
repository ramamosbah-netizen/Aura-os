import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Vehicle } from './domain/vehicle';
import type { FuelLog } from './domain/fuel-log';
import type { MaintenanceRecord } from './domain/maintenance';
import type { VehicleStore, FuelLogStore, MaintenanceStore } from './store.interface';

export class PostgresVehicleStore implements VehicleStore {
  constructor(private readonly pool: Pool) {}

  async save(vehicle: Vehicle, tx?: TxHandle): Promise<Vehicle> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_fleet_vehicles (
        id, tenant_id, company_id, make, model, year, plate_number, registration_expiry, status, driver_employee_id, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (id) do update set
        make = excluded.make,
        model = excluded.model,
        year = excluded.year,
        plate_number = excluded.plate_number,
        registration_expiry = excluded.registration_expiry,
        status = excluded.status,
        driver_employee_id = excluded.driver_employee_id,
        updated_at = excluded.updated_at
      returning *`,
      [
        vehicle.id,
        vehicle.tenantId,
        vehicle.companyId,
        vehicle.make,
        vehicle.model,
        vehicle.year,
        vehicle.plateNumber,
        vehicle.registrationExpiry,
        vehicle.status,
        vehicle.driverEmployeeId,
        vehicle.createdAt,
        vehicle.updatedAt,
      ],
    );
    return this.mapVehicle(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<Vehicle | null> {
    const res = await this.pool.query(
      `select * from public.aura_fleet_vehicles where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapVehicle(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<Vehicle[]> {
    const res = await this.pool.query(
      `select * from public.aura_fleet_vehicles where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapVehicle);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `delete from public.aura_fleet_vehicles where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  private mapVehicle(row: any): Vehicle {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      make: row.make,
      model: row.model,
      year: row.year,
      plateNumber: row.plate_number,
      registrationExpiry: row.registration_expiry instanceof Date ? row.registration_expiry.toISOString().split('T')[0] : row.registration_expiry ? String(row.registration_expiry) : null,
      status: row.status,
      driverEmployeeId: row.driver_employee_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresFuelLogStore implements FuelLogStore {
  constructor(private readonly pool: Pool) {}

  async save(log: FuelLog, tx?: TxHandle): Promise<FuelLog> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_fleet_fuel_logs (
        id, tenant_id, company_id, vehicle_id, date, liters, cost, odometer, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (id) do update set
        liters = excluded.liters,
        cost = excluded.cost,
        odometer = excluded.odometer,
        updated_at = excluded.updated_at
      returning *`,
      [
        log.id,
        log.tenantId,
        log.companyId,
        log.vehicleId,
        log.date,
        log.liters,
        log.cost,
        log.odometer,
        log.createdAt,
        log.updatedAt,
      ],
    );
    return this.mapFuelLog(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<FuelLog | null> {
    const res = await this.pool.query(
      `select * from public.aura_fleet_fuel_logs where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapFuelLog(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<FuelLog[]> {
    const res = await this.pool.query(
      `select * from public.aura_fleet_fuel_logs where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapFuelLog);
  }

  async findByVehicle(tenantId: string, vehicleId: string): Promise<FuelLog[]> {
    const res = await this.pool.query(
      `select * from public.aura_fleet_fuel_logs where tenant_id = $1 and vehicle_id = $2 order by created_at desc`,
      [tenantId, vehicleId],
    );
    return res.rows.map(this.mapFuelLog);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `delete from public.aura_fleet_fuel_logs where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  private mapFuelLog(row: any): FuelLog {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      vehicleId: row.vehicle_id,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      liters: Number(row.liters),
      cost: Number(row.cost),
      odometer: row.odometer,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresMaintenanceStore implements MaintenanceStore {
  constructor(private readonly pool: Pool) {}

  async save(record: MaintenanceRecord, tx?: TxHandle): Promise<MaintenanceRecord> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_fleet_maintenance (
        id, tenant_id, company_id, vehicle_id, date, description, cost, status, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (id) do update set
        cost = excluded.cost,
        status = excluded.status,
        updated_at = excluded.updated_at
      returning *`,
      [
        record.id,
        record.tenantId,
        record.companyId,
        record.vehicleId,
        record.date,
        record.description,
        record.cost,
        record.status,
        record.createdAt,
        record.updatedAt,
      ],
    );
    return this.mapMaintenance(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<MaintenanceRecord | null> {
    const res = await this.pool.query(
      `select * from public.aura_fleet_maintenance where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapMaintenance(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<MaintenanceRecord[]> {
    const res = await this.pool.query(
      `select * from public.aura_fleet_maintenance where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapMaintenance);
  }

  async findByVehicle(tenantId: string, vehicleId: string): Promise<MaintenanceRecord[]> {
    const res = await this.pool.query(
      `select * from public.aura_fleet_maintenance where tenant_id = $1 and vehicle_id = $2 order by created_at desc`,
      [tenantId, vehicleId],
    );
    return res.rows.map(this.mapMaintenance);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `delete from public.aura_fleet_maintenance where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  private mapMaintenance(row: any): MaintenanceRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      vehicleId: row.vehicle_id,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      description: row.description,
      cost: Number(row.cost),
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
