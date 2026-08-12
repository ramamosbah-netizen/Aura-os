import { randomUUID } from 'node:crypto';

/**
 * Traffic Fine — a UAE traffic violation charged against a fleet vehicle. Black points (UAE: 0–24)
 * and the vehicle/driver link support HR liability deduction.
 *
 *   pending ─assign→ assigned ─pay→ paid
 *      │                 │
 *      ├──── pay ────────┘
 *      └─dispute→ disputed ─┬─reject→ pending   (liability stands, recovery resumes)
 *                           └─uphold→ cancelled (authority waived it)
 *
 * `disputed` used to be a dead end: nothing could leave it, so a rejected dispute left the fine
 * unrecoverable and a successful one left it looking unpaid forever. Both exits are now explicit,
 * which is the difference between a workflow and a status that happens to have four values.
 */
export type FineStatus = 'pending' | 'assigned' | 'disputed' | 'paid' | 'cancelled';

/** Allowed transitions. `paid` and `cancelled` are terminal — the fine is settled either way. */
export const FINE_TRANSITIONS: Record<FineStatus, FineStatus[]> = {
  pending: ['assigned', 'disputed', 'paid'],
  assigned: ['paid', 'disputed'],
  disputed: ['pending', 'cancelled'],
  paid: [],
  cancelled: [],
};

export class FineTransitionError extends Error {
  constructor(from: FineStatus, to: FineStatus) {
    // "can only" so the API error taxonomy classifies this 409 CONFLICT, not 400.
    super(`a traffic fine in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'FineTransitionError';
  }
}

export function canTransitionFine(from: FineStatus, to: FineStatus): boolean {
  return FINE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertFineTransition(from: FineStatus, to: FineStatus): void {
  if (!canTransitionFine(from, to)) throw new FineTransitionError(from, to);
}

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
  assertFineTransition(fine.status, 'assigned');
  if (!driverEmployeeId) throw new Error('driverEmployeeId is required to assign');
  return { ...fine, status: 'assigned', driverEmployeeId, updatedAt: new Date().toISOString() };
}

/** Contest the fine with the authority. Recovery pauses until the dispute is resolved. */
export function disputeFine(fine: TrafficFine): TrafficFine {
  assertFineTransition(fine.status, 'disputed');
  return { ...fine, status: 'disputed', updatedAt: new Date().toISOString() };
}

/**
 * Close a dispute. `upheld` means the authority cancelled the fine — terminal, nothing to recover.
 * Otherwise liability stands and the fine returns to `pending` so recovery can resume; the driver
 * assignment is cleared because the dispute was about who owed it.
 */
export function resolveDispute(fine: TrafficFine, upheld: boolean): TrafficFine {
  const to: FineStatus = upheld ? 'cancelled' : 'pending';
  assertFineTransition(fine.status, to);
  return {
    ...fine,
    status: to,
    driverEmployeeId: upheld ? fine.driverEmployeeId : null,
    updatedAt: new Date().toISOString(),
  };
}

/** Mark paid — allowed from pending or assigned (company or driver settles it). */
export function payFine(fine: TrafficFine, paidDate?: string): TrafficFine {
  assertFineTransition(fine.status, 'paid');
  return {
    ...fine,
    status: 'paid',
    paidDate: paidDate ?? new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
}
