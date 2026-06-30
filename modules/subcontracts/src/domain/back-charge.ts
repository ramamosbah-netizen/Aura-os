import { type Id, newId } from '@aura/shared';

/**
 * Back-charge (contra-charge) — a cost the main contractor incurs that should be
 * borne by the subcontractor, charged back against their account and recovered by
 * deducting from their payment certificates (claims).
 *
 * Typical triggers: the contractor supplies materials/plant on the subcontractor's
 * behalf, rectifies defective work, provides attendance, or cleans up after them.
 * The contractor usually adds an administrative handling markup on top of the raw
 * cost. The back-charge is "raised", the subcontractor "agrees" or "disputes" it,
 * and once agreed it is "recovered" (in part or full) out of their certified claims.
 */

export type BackChargeStatus = 'raised' | 'agreed' | 'disputed' | 'recovered' | 'written_off';

export type BackChargeCategory =
  | 'materials'
  | 'plant'
  | 'labour'
  | 'rectification'
  | 'attendance'
  | 'other';

export interface BackCharge {
  id: Id;
  tenantId: Id;
  subcontractId: Id;
  subcontractorName: string | null; // snapshot — no join back to the subcontract
  reference: string; // e.g. BC-001
  category: BackChargeCategory;
  description: string;
  grossAmount: number; // raw cost incurred by the contractor
  markupPercent: number; // administrative handling fee, e.g. 10 for 10%
  markupAmount: number; // grossAmount * markupPercent%
  recoverableAmount: number; // grossAmount + markupAmount
  recoveredAmount: number; // cumulative amount deducted from claims
  outstandingAmount: number; // recoverableAmount - recoveredAmount
  status: BackChargeStatus;
  raisedAt: string;
  agreedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewBackCharge {
  tenantId: Id;
  subcontractId: Id;
  subcontractorName?: string | null;
  reference: string;
  category?: BackChargeCategory;
  description: string;
  grossAmount: number;
  markupPercent?: number;
}

const round2 = (n: number): number => Number((Number.isFinite(n) ? n : 0).toFixed(2));

export function makeBackCharge(input: NewBackCharge): BackCharge {
  const gross = Number(input.grossAmount);
  if (!(gross > 0)) throw new Error('back-charge gross amount must be positive');

  const markupPercent = Number.isFinite(input.markupPercent) ? Number(input.markupPercent) : 0;
  if (markupPercent < 0) throw new Error('back-charge markup percent cannot be negative');

  if (!input.description?.trim()) throw new Error('back-charge description is required');
  if (!input.reference?.trim()) throw new Error('back-charge reference is required');

  const grossR = round2(gross);
  const markupAmount = round2(grossR * (markupPercent / 100));
  const recoverable = round2(grossR + markupAmount);
  const now = new Date().toISOString();

  return {
    id: newId(),
    tenantId: input.tenantId,
    subcontractId: input.subcontractId,
    subcontractorName: input.subcontractorName?.trim() || null,
    reference: input.reference.trim(),
    category: input.category ?? 'other',
    description: input.description.trim(),
    grossAmount: grossR,
    markupPercent,
    markupAmount,
    recoverableAmount: recoverable,
    recoveredAmount: 0,
    outstandingAmount: recoverable,
    status: 'raised',
    raisedAt: now,
    agreedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Record a recovery against an agreed back-charge (a deduction from the
 * subcontractor's certified claim). Only an `agreed` back-charge can be recovered,
 * and a recovery may never exceed the outstanding balance. Once fully recovered the
 * status flips to `recovered`.
 */
export function applyRecovery(bc: BackCharge, amount: number): BackCharge {
  if (bc.status !== 'agreed') {
    throw new Error(`only an agreed back-charge can be recovered (current status: ${bc.status})`);
  }
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('recovery amount must be positive');
  if (round2(amt) > bc.outstandingAmount) {
    throw new Error(`recovery ${amt} exceeds outstanding ${bc.outstandingAmount}`);
  }

  const recovered = round2(bc.recoveredAmount + amt);
  const outstanding = round2(bc.recoverableAmount - recovered);
  const fullyRecovered = outstanding <= 0;

  return {
    ...bc,
    recoveredAmount: recovered,
    outstandingAmount: Math.max(0, outstanding),
    status: fullyRecovered ? 'recovered' : bc.status,
    updatedAt: new Date().toISOString(),
  };
}

export interface BackChargeSummary {
  count: number;
  totalGross: number;
  totalMarkup: number;
  totalRecoverable: number;
  totalRecovered: number;
  totalOutstanding: number;
  byStatus: Record<BackChargeStatus, number>;
}

export function summariseBackCharges(list: BackCharge[]): BackChargeSummary {
  const byStatus: Record<BackChargeStatus, number> = {
    raised: 0,
    agreed: 0,
    disputed: 0,
    recovered: 0,
    written_off: 0,
  };
  let totalGross = 0;
  let totalMarkup = 0;
  let totalRecoverable = 0;
  let totalRecovered = 0;
  let totalOutstanding = 0;

  for (const bc of list) {
    byStatus[bc.status] += 1;
    totalGross += bc.grossAmount;
    totalMarkup += bc.markupAmount;
    totalRecoverable += bc.recoverableAmount;
    totalRecovered += bc.recoveredAmount;
    // Written-off back-charges are no longer expected to be recovered.
    if (bc.status !== 'written_off' && bc.status !== 'recovered') {
      totalOutstanding += bc.outstandingAmount;
    }
  }

  return {
    count: list.length,
    totalGross: round2(totalGross),
    totalMarkup: round2(totalMarkup),
    totalRecoverable: round2(totalRecoverable),
    totalRecovered: round2(totalRecovered),
    totalOutstanding: round2(totalOutstanding),
    byStatus,
  };
}

export const BACK_CHARGE_EVENT = {
  raised: 'subcontracts.backcharge.raised',
  statusChanged: 'subcontracts.backcharge.statusChanged',
  recovered: 'subcontracts.backcharge.recovered',
} as const;
