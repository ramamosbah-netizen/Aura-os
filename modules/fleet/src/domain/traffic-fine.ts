import { randomUUID } from 'node:crypto';

/**
 * Traffic Fine — a UAE traffic violation charged against a fleet vehicle. Lifecycle:
 * pending → assigned (driver liability accepted) → paid. A fine can be disputed from pending.
 * Black points (UAE: 0–24) and the vehicle/driver link support HR liability deduction.
 */
export type FineStatus = 'pending' | 'assigned' | 'disputed' | 'paid';

export interface TrafficFine {
  id: string;
  tenantId: string;
  companyId: string | null;
  vehicleId: string;
  driverEmployeeId: string | null;
  fineNumber: string;
  violation: string;
  location: string;
  amount: number;
  blackPoints: number;
  fineDate: string; // YYYY-MM-DD
  status: FineStatus;
  paidDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewTrafficFine {
  tenantId: string;
  companyId?: string | null;
  vehicleId: string;
  fineNumber: string;
  violation: string;
  location?: string;
  amount: number;
  blackPoints?: number;
  fineDate: string;
}

export function makeTrafficFine(input: NewTrafficFine): TrafficFine {
  if (!input.vehicleId) throw new Error('vehicleId is required');
  if (!input.fineNumber?.trim()) throw new Error('fineNumber is required');
  if (!input.violation?.trim()) throw new Error('violation is required');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');
  const bp = Number(input.blackPoints ?? 0);
  if (!Number.isFinite(bp) || bp < 0 || bp > 24) throw new Error('black points must be between 0 and 24');
  if (!input.fineDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.fineDate)) throw new Error('fineDate must be YYYY-MM-DD');

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    vehicleId: input.vehicleId,
    driverEmployeeId: null,
    fineNumber: input.fineNumber.trim(),
    violation: input.violation.trim(),
    location: input.location?.trim() || '',
    amount,
    blackPoints: bp,
    fineDate: input.fineDate,
    status: 'pending',
    paidDate: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Assign driver liability — moves pending → assigned and records who's responsible. */
export function assignFine(fine: TrafficFine, driverEmployeeId: string): TrafficFine {
  if (fine.status !== 'pending') throw new Error(`cannot assign from status ${fine.status}`);
  if (!driverEmployeeId) throw new Error('driverEmployeeId is required to assign');
  return { ...fine, status: 'assigned', driverEmployeeId, updatedAt: new Date().toISOString() };
}

export function disputeFine(fine: TrafficFine): TrafficFine {
  if (fine.status !== 'pending') throw new Error(`cannot dispute from status ${fine.status}`);
  return { ...fine, status: 'disputed', updatedAt: new Date().toISOString() };
}

/** Mark paid — allowed from pending or assigned (company or driver settles it). */
export function payFine(fine: TrafficFine, paidDate?: string): TrafficFine {
  if (fine.status === 'paid') throw new Error('fine already paid');
  if (fine.status === 'disputed') throw new Error('cannot pay a disputed fine — resolve the dispute first');
  return {
    ...fine,
    status: 'paid',
    paidDate: paidDate ?? new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
}
