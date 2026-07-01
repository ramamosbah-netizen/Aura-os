import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Vehicle } from './domain/vehicle';
import type { FuelLog } from './domain/fuel-log';
import type { MaintenanceRecord } from './domain/maintenance';
import type { TrafficFine } from './domain/traffic-fine';
import type { SalikCharge } from './domain/salik-charge';
import type { VehicleStore, FuelLogStore, MaintenanceStore, TrafficFineStore, SalikChargeStore } from './store.interface';

// pg returns `date` columns as a JS Date constructed in the server's local TZ.
// Extract the calendar date via LOCAL components so we get the date that was actually stored.
function dateOnly(v: Date | string | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const y = v.getFullYear();
  const m = String(v.getMonth() + 1).padStart(2, '0');
  const d = String(v.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

  private mapVehicle(row: QueryResultRow): Vehicle {
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

  private mapFuelLog(row: QueryResultRow): FuelLog {
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

  private mapMaintenance(row: QueryResultRow): MaintenanceRecord {
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

export class PostgresTrafficFineStore implements TrafficFineStore {
  constructor(private readonly pool: Pool) {}

  async save(fine: TrafficFine, tx?: TxHandle): Promise<TrafficFine> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_fleet_traffic_fines (
        id, tenant_id, company_id, vehicle_id, driver_employee_id, fine_number, violation, location, amount, black_points, fine_date, status, paid_date, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      on conflict (id) do update set
        driver_employee_id = excluded.driver_employee_id,
        status = excluded.status,
        paid_date = excluded.paid_date,
        updated_at = excluded.updated_at
      returning *`,
      [
        fine.id, fine.tenantId, fine.companyId, fine.vehicleId, fine.driverEmployeeId, fine.fineNumber,
        fine.violation, fine.location, fine.amount, fine.blackPoints, fine.fineDate, fine.status,
        fine.paidDate, fine.createdAt, fine.updatedAt,
      ],
    );
    return this.mapFine(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<TrafficFine | null> {
    const res = await this.pool.query(`select * from public.aura_fleet_traffic_fines where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rows.length ? this.mapFine(res.rows[0]) : null;
  }

  async findByTenant(tenantId: string): Promise<TrafficFine[]> {
    const res = await this.pool.query(`select * from public.aura_fleet_traffic_fines where tenant_id = $1 order by created_at desc`, [tenantId]);
    return res.rows.map(this.mapFine);
  }

  async findByVehicle(tenantId: string, vehicleId: string): Promise<TrafficFine[]> {
    const res = await this.pool.query(`select * from public.aura_fleet_traffic_fines where tenant_id = $1 and vehicle_id = $2 order by created_at desc`, [tenantId, vehicleId]);
    return res.rows.map(this.mapFine);
  }

  private mapFine(row: QueryResultRow): TrafficFine {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      vehicleId: row.vehicle_id,
      driverEmployeeId: row.driver_employee_id,
      fineNumber: row.fine_number,
      violation: row.violation,
      location: row.location || '',
      amount: Number(row.amount),
      blackPoints: Number(row.black_points),
      fineDate: dateOnly(row.fine_date),
      status: row.status,
      paidDate: row.paid_date ? dateOnly(row.paid_date) : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}

export class PostgresSalikChargeStore implements SalikChargeStore {
  constructor(private readonly pool: Pool) {}

  async save(charge: SalikCharge, tx?: TxHandle): Promise<SalikCharge> {
    const conn = (tx as PoolClient) || this.pool;
    const res = await conn.query(
      `insert into public.aura_fleet_salik_charges (
        id, tenant_id, company_id, vehicle_id, plate_number, gate, charge_date, charge_time, amount, status, allocated_to, notes, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      on conflict (id) do update set
        status = excluded.status,
        allocated_to = excluded.allocated_to,
        updated_at = excluded.updated_at
      returning *`,
      [
        charge.id, charge.tenantId, charge.companyId, charge.vehicleId, charge.plateNumber, charge.gate,
        charge.chargeDate, charge.chargeTime, charge.amount, charge.status, charge.allocatedTo, charge.notes,
        charge.createdAt, charge.updatedAt,
      ],
    );
    return this.mapSalik(res.rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<SalikCharge | null> {
    const res = await this.pool.query(`select * from public.aura_fleet_salik_charges where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rows.length ? this.mapSalik(res.rows[0]) : null;
  }

  async findByTenant(tenantId: string): Promise<SalikCharge[]> {
    const res = await this.pool.query(`select * from public.aura_fleet_salik_charges where tenant_id = $1 order by created_at desc`, [tenantId]);
    return res.rows.map(this.mapSalik);
  }

  async findByVehicle(tenantId: string, vehicleId: string): Promise<SalikCharge[]> {
    const res = await this.pool.query(`select * from public.aura_fleet_salik_charges where tenant_id = $1 and vehicle_id = $2 order by created_at desc`, [tenantId, vehicleId]);
    return res.rows.map(this.mapSalik);
  }

  private mapSalik(row: QueryResultRow): SalikCharge {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      vehicleId: row.vehicle_id,
      plateNumber: row.plate_number || '',
      gate: row.gate,
      chargeDate: dateOnly(row.charge_date),
      chargeTime: row.charge_time || '',
      amount: Number(row.amount),
      status: row.status,
      allocatedTo: row.allocated_to || '',
      notes: row.notes || '',
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
