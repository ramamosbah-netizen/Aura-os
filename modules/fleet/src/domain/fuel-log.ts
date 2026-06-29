import { randomUUID } from 'node:crypto';

export interface FuelLog {
  id: string;
  tenantId: string;
  companyId: string | null;
  vehicleId: string;
  date: string; // YYYY-MM-DD
  liters: number;
  cost: number;
  odometer: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewFuelLog {
  tenantId: string;
  companyId?: string | null;
  vehicleId: string;
  date: string;
  liters: number;
  cost: number;
  odometer: number;
}

export function makeFuelLog(input: NewFuelLog): FuelLog {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    vehicleId: input.vehicleId,
    date: input.date,
    liters: input.liters,
    cost: input.cost,
    odometer: input.odometer,
    createdAt: now,
    updatedAt: now,
  };
}
