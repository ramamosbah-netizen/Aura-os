import { randomUUID } from 'node:crypto';

export interface MaintenanceRecord {
  id: string;
  tenantId: string;
  companyId: string | null;
  vehicleId: string;
  date: string; // YYYY-MM-DD
  description: string;
  cost: number;
  status: 'scheduled' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface NewMaintenanceRecord {
  tenantId: string;
  companyId?: string | null;
  vehicleId: string;
  date: string;
  description: string;
  cost?: number;
  status?: MaintenanceRecord['status'];
}

export function makeMaintenanceRecord(input: NewMaintenanceRecord): MaintenanceRecord {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    vehicleId: input.vehicleId,
    date: input.date,
    description: input.description.trim(),
    cost: input.cost ?? 0,
    status: input.status ?? 'scheduled',
    createdAt: now,
    updatedAt: now,
  };
}
