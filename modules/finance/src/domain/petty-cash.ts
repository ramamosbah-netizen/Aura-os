import { type Id, newId } from '@aura/shared';

/**
 * Petty Cash — an imprest cash float held by a custodian (typically per site/office).
 * Top-ups (replenishment) increase the balance; expenses (disbursements) decrease it.
 * An expense can never drive the balance negative. Every movement records the running balance.
 */
export type PettyCashStatus = 'active' | 'closed';

export interface PettyCashFund {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  name: string;
  custodianEmployeeId: Id | null;
  balance: number;
  status: PettyCashStatus;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewPettyCashFund {
  tenantId: Id;
  companyId?: Id | null;
  name: string;
  custodianEmployeeId?: Id | null;
  openingFloat?: number;
  createdBy?: Id | null;
}

export function makePettyCashFund(input: NewPettyCashFund): PettyCashFund {
  if (!input.name || !input.name.trim()) throw new Error('petty cash fund name is required');
  const opening = Number(input.openingFloat ?? 0);
  if (!Number.isFinite(opening) || opening < 0) throw new Error('opening float cannot be negative');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    name: input.name.trim(),
    custodianEmployeeId: input.custodianEmployeeId ?? null,
    balance: opening,
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export type PettyCashTxType = 'topup' | 'expense';

export type PettyCashCategory = 'office' | 'travel' | 'fuel' | 'materials' | 'refreshments' | 'other';

const CATEGORIES: PettyCashCategory[] = ['office', 'travel', 'fuel', 'materials', 'refreshments', 'other'];

export interface PettyCashTransaction {
  id: Id;
  tenantId: Id;
  fundId: Id;
  type: PettyCashTxType;
  category: PettyCashCategory;
  amount: number;
  description: string;
  balanceAfter: number;
  transactionDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface NewPettyCashTransaction {
  tenantId: Id;
  fundId: Id;
  type: PettyCashTxType;
  category?: PettyCashCategory;
  amount: number;
  description?: string;
  transactionDate: string;
}

/** Compute the balance after a movement; throws if an expense would overdraw the float. */
export function applyPettyCashTx(balance: number, type: PettyCashTxType, amount: number): number {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) throw new Error('amount must be positive');
  const next = type === 'topup' ? balance + a : balance - a;
  if (next < 0) throw new Error(`insufficient petty cash: balance ${balance}, expense ${a}`);
  return next;
}

export function makePettyCashTransaction(input: NewPettyCashTransaction, balanceAfter: number): PettyCashTransaction {
  if (input.type !== 'topup' && input.type !== 'expense') throw new Error("type must be 'topup' or 'expense'");
  const category = input.category ?? 'other';
  if (input.type === 'expense' && !CATEGORIES.includes(category)) {
    throw new Error(`category must be one of: ${CATEGORIES.join(', ')}`);
  }
  if (!input.transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.transactionDate)) {
    throw new Error('transactionDate must be YYYY-MM-DD');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    fundId: input.fundId,
    type: input.type,
    category,
    amount: Number(input.amount),
    description: input.description?.trim() || (input.type === 'topup' ? 'replenishment' : 'disbursement'),
    balanceAfter,
    transactionDate: input.transactionDate,
    createdAt: new Date().toISOString(),
  };
}

export const PETTY_CASH_EVENT = {
  fundCreated: 'finance.petty_cash.fund_created',
  txRecorded: 'finance.petty_cash.tx_recorded',
} as const;
