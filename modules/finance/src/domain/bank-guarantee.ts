import { type Id, newId } from '@aura/shared';

/**
 * Bank Guarantee / bond — an instrument a bank issues on the company's behalf to a beneficiary
 * (client/main contractor). Construction in the UAE runs on these: tender bonds, performance
 * bonds, advance-payment guarantees, retention bonds. Tracked through their life:
 * active → released (returned) | claimed (called by beneficiary) | expired (past expiry, unreturned).
 */
export type GuaranteeType = 'tender' | 'performance' | 'advance_payment' | 'retention' | 'other';

export type GuaranteeStatus = 'active' | 'released' | 'claimed' | 'expired';

export interface BankGuarantee {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  reference: string;
  type: GuaranteeType;
  beneficiary: string;
  bankName: string;
  projectId: Id | null;
  projectName: string | null;
  amount: number;
  currency: string;
  issueDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  status: GuaranteeStatus;
  notes: string;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewBankGuarantee {
  tenantId: Id;
  companyId?: Id | null;
  reference: string;
  type: GuaranteeType;
  beneficiary: string;
  bankName: string;
  projectId?: Id | null;
  projectName?: string | null;
  amount: number;
  currency?: string;
  issueDate: string;
  expiryDate: string;
  notes?: string;
  createdBy?: Id | null;
}

const TYPES: GuaranteeType[] = ['tender', 'performance', 'advance_payment', 'retention', 'other'];

export function makeBankGuarantee(input: NewBankGuarantee): BankGuarantee {
  if (!input.reference?.trim()) throw new Error('reference is required');
  if (!TYPES.includes(input.type)) throw new Error(`type must be one of: ${TYPES.join(', ')}`);
  if (!input.beneficiary?.trim()) throw new Error('beneficiary is required');
  if (!input.bankName?.trim()) throw new Error('bankName is required');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');
  if (!input.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) throw new Error('issueDate must be YYYY-MM-DD');
  if (!input.expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiryDate)) throw new Error('expiryDate must be YYYY-MM-DD');
  if (input.expiryDate < input.issueDate) throw new Error('expiryDate cannot be before issueDate');

  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    reference: input.reference.trim(),
    type: input.type,
    beneficiary: input.beneficiary.trim(),
    bankName: input.bankName.trim(),
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    amount,
    currency: input.currency?.trim() || 'AED',
    issueDate: input.issueDate,
    expiryDate: input.expiryDate,
    status: 'active',
    notes: input.notes?.trim() || '',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

function transition(g: BankGuarantee, to: GuaranteeStatus): BankGuarantee {
  if (g.status !== 'active') throw new Error(`cannot ${to} a guarantee in status ${g.status}`);
  return { ...g, status: to };
}

/** Beneficiary returned the instrument — obligation discharged. */
export function releaseGuarantee(g: BankGuarantee): BankGuarantee {
  return transition(g, 'released');
}

/** Beneficiary called the guarantee — the bank pays out. */
export function claimGuarantee(g: BankGuarantee): BankGuarantee {
  return transition(g, 'claimed');
}

export function expireGuarantee(g: BankGuarantee): BankGuarantee {
  return transition(g, 'expired');
}

/** Whole days from `asOf` (YYYY-MM-DD) to expiry; negative once past expiry. */
export function daysToExpiry(g: BankGuarantee, asOf: string): number {
  const ms = Date.parse(`${g.expiryDate}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Active guarantees within `withinDays` of expiry (inclusive), not yet past it. */
export function isExpiringSoon(g: BankGuarantee, asOf: string, withinDays = 30): boolean {
  if (g.status !== 'active') return false;
  const d = daysToExpiry(g, asOf);
  return d >= 0 && d <= withinDays;
}

export const BANK_GUARANTEE_EVENT = {
  created: 'finance.bank_guarantee.created',
  statusChanged: 'finance.bank_guarantee.status_changed',
} as const;
