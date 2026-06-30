import { randomUUID } from 'node:crypto';

/**
 * Salik (Dubai road toll) charge against a fleet vehicle — a fixed fee deducted each time the
 * vehicle passes a toll gate. Recorded from the monthly Salik statement, then either allocated
 * to a cost owner (driver/project) for recovery or disputed. Lifecycle:
 * recorded → allocated | disputed.
 */
export type SalikStatus = 'recorded' | 'allocated' | 'disputed';

export interface SalikCharge {
  id: string;
  tenantId: string;
  companyId: string | null;
  vehicleId: string;
  plateNumber: string;
  gate: string;
  chargeDate: string; // YYYY-MM-DD
  chargeTime: string; // HH:MM (optional, '' if unknown)
  amount: number;
  status: SalikStatus;
  allocatedTo: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewSalikCharge {
  tenantId: string;
  companyId?: string | null;
  vehicleId: string;
  plateNumber?: string;
  gate: string;
  chargeDate: string;
  chargeTime?: string;
  amount?: number;
  notes?: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function makeSalikCharge(input: NewSalikCharge): SalikCharge {
  if (!input.vehicleId) throw new Error('vehicleId is required');
  if (!input.gate?.trim()) throw new Error('gate is required');
  if (!input.chargeDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.chargeDate)) throw new Error('chargeDate must be YYYY-MM-DD');
  if (input.chargeTime && !TIME_RE.test(input.chargeTime)) throw new Error('chargeTime must be HH:MM');
  // Salik is a fixed 4 AED toll (6 at Sheikh Zayed Rd in peak); default to 4 when not given.
  const amount = input.amount === undefined ? 4 : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    vehicleId: input.vehicleId,
    plateNumber: input.plateNumber?.trim() || '',
    gate: input.gate.trim(),
    chargeDate: input.chargeDate,
    chargeTime: input.chargeTime || '',
    amount,
    status: 'recorded',
    allocatedTo: '',
    notes: input.notes?.trim() || '',
    createdAt: now,
    updatedAt: now,
  };
}

/** Allocate the toll to a cost owner (driver/project ref) for recovery: recorded → allocated. */
export function allocateSalik(charge: SalikCharge, allocatedTo: string): SalikCharge {
  if (charge.status !== 'recorded') throw new Error(`cannot allocate from status ${charge.status}`);
  if (!allocatedTo?.trim()) throw new Error('allocatedTo is required to allocate');
  return { ...charge, status: 'allocated', allocatedTo: allocatedTo.trim(), updatedAt: new Date().toISOString() };
}

/** Dispute an erroneous toll: recorded → disputed. */
export function disputeSalik(charge: SalikCharge): SalikCharge {
  if (charge.status !== 'recorded') throw new Error(`cannot dispute from status ${charge.status}`);
  return { ...charge, status: 'disputed', updatedAt: new Date().toISOString() };
}

export interface SalikSummary {
  count: number;
  totalAmount: number;
  recorded: number;
  allocated: number;
  disputed: number;
}

/** Roll a set of Salik charges into counts by status + total AED (excludes disputed from total). */
export function summariseSalik(charges: SalikCharge[]): SalikSummary {
  const s: SalikSummary = { count: charges.length, totalAmount: 0, recorded: 0, allocated: 0, disputed: 0 };
  for (const c of charges) {
    if (c.status === 'recorded') s.recorded++;
    else if (c.status === 'allocated') s.allocated++;
    else if (c.status === 'disputed') s.disputed++;
    if (c.status !== 'disputed') s.totalAmount += c.amount;
  }
  s.totalAmount = Math.round(s.totalAmount * 100) / 100;
  return s;
}

export const SALIK_EVENT = {
  recorded: 'fleet.salik.recorded',
  allocated: 'fleet.salik.allocated',
  disputed: 'fleet.salik.disputed',
} as const;
