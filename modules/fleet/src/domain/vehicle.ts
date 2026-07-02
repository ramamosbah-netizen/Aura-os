import { randomUUID } from 'node:crypto';

export interface Vehicle {
  id: string;
  tenantId: string;
  companyId: string | null;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  registrationExpiry: string | null; // YYYY-MM-DD
  status: 'active' | 'maintenance' | 'retired';
  driverEmployeeId: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastSpeed: number | null;
  lastOdometer: number | null;
  lastTelemetryAt: string | null;
  /** Soft-delete marker — deleted vehicles are hidden from finds but restorable. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewVehicle {
  tenantId: string;
  companyId?: string | null;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  registrationExpiry?: string | null;
  status?: Vehicle['status'];
  driverEmployeeId?: string | null;
}

export function makeVehicle(input: NewVehicle): Vehicle {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    make: input.make.trim(),
    model: input.model.trim(),
    year: input.year,
    plateNumber: input.plateNumber.trim().toUpperCase(),
    registrationExpiry: input.registrationExpiry ?? null,
    status: input.status ?? 'active',
    driverEmployeeId: input.driverEmployeeId ?? null,
    lastLatitude: null,
    lastLongitude: null,
    lastSpeed: null,
    lastOdometer: null,
    lastTelemetryAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
