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
  /**
   * WHO COMPLETED IT. The record carried a status and no actor at all — not even `createdBy` — and
   * the module held no write permission on any shipped role, so the act was administrator-only and
   * unattributable at the same time.
   */
  completedBy?: string | null;
  completedAt?: string | null;
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
