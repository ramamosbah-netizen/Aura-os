import { type Id, newId } from '@aura/shared';

/**
 * Post-Dated Cheque (PDC) — a cheque written today but dated for a future maturity date,
 * to be banked only on/after that date. PDCs are the lifeblood of UAE trade: customers
 * settle with a strip of post-dated cheques and suppliers are paid the same way.
 *
 * Direction:
 *   received — a customer's cheque we hold (a receivable); banked on maturity to collect.
 *   issued   — our cheque handed to a supplier (a payable); must be funded by maturity.
 *
 * Lifecycle: pending → deposited → cleared | bounced; a bounced cheque can be re-presented
 * (→ deposited, bounce count++) or written off (→ cancelled); a pending cheque can be
 * cancelled (stop payment). The maturity watch-list surfaces pending cheques coming due.
 */
export type ChequeDirection = 'received' | 'issued';

export type ChequeStatus = 'pending' | 'deposited' | 'cleared' | 'bounced' | 'cancelled';

export interface PostDatedCheque {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  chequeNumber: string;
  direction: ChequeDirection;
  partyName: string; // drawer (received) or payee (issued)
  bankName: string;
  amount: number;
  currency: string;
  issueDate: string; // YYYY-MM-DD — when written/received
  maturityDate: string; // YYYY-MM-DD — the post-date; bankable on/after this
  status: ChequeStatus;
  reference: string | null; // linked invoice / PO reference
  bounceCount: number;
  notes: string;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewPostDatedCheque {
  tenantId: Id;
  companyId?: Id | null;
  chequeNumber: string;
  direction: ChequeDirection;
  partyName: string;
  bankName: string;
  amount: number;
  currency?: string;
  issueDate: string;
  maturityDate: string;
  reference?: string | null;
  notes?: string;
  createdBy?: Id | null;
}

const DIRECTIONS: ChequeDirection[] = ['received', 'issued'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function makePostDatedCheque(input: NewPostDatedCheque): PostDatedCheque {
  if (!input.chequeNumber?.trim()) throw new Error('chequeNumber is required');
  if (!DIRECTIONS.includes(input.direction)) throw new Error(`direction must be one of: ${DIRECTIONS.join(', ')}`);
  if (!input.partyName?.trim()) throw new Error('partyName is required');
  if (!input.bankName?.trim()) throw new Error('bankName is required');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');
  if (!input.issueDate || !DATE_RE.test(input.issueDate)) throw new Error('issueDate must be YYYY-MM-DD');
  if (!input.maturityDate || !DATE_RE.test(input.maturityDate)) throw new Error('maturityDate must be YYYY-MM-DD');
  if (input.maturityDate < input.issueDate) throw new Error('maturityDate cannot be before issueDate');

  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    chequeNumber: input.chequeNumber.trim(),
    direction: input.direction,
    partyName: input.partyName.trim(),
    bankName: input.bankName.trim(),
    amount,
    currency: input.currency?.trim() || 'AED',
    issueDate: input.issueDate,
    maturityDate: input.maturityDate,
    status: 'pending',
    reference: input.reference?.trim() || null,
    bounceCount: 0,
    notes: input.notes?.trim() || '',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export type ChequeAction = 'deposit' | 'clear' | 'bounce' | 'represent' | 'cancel';

/** Present a pending cheque to the bank for collection/payment. */
export function depositCheque(c: PostDatedCheque): PostDatedCheque {
  if (c.status !== 'pending') throw new Error(`cannot deposit a cheque in status ${c.status}`);
  return { ...c, status: 'deposited' };
}

/** Funds settled. */
export function clearCheque(c: PostDatedCheque): PostDatedCheque {
  if (c.status !== 'deposited') throw new Error(`only a deposited cheque can clear (status ${c.status})`);
  return { ...c, status: 'cleared' };
}

/** Returned unpaid by the bank. */
export function bounceCheque(c: PostDatedCheque): PostDatedCheque {
  if (c.status !== 'deposited') throw new Error(`only a deposited cheque can bounce (status ${c.status})`);
  return { ...c, status: 'bounced' };
}

/** Re-present a bounced cheque — back to deposited, counting the bounce. */
export function representCheque(c: PostDatedCheque): PostDatedCheque {
  if (c.status !== 'bounced') throw new Error(`only a bounced cheque can be re-presented (status ${c.status})`);
  return { ...c, status: 'deposited', bounceCount: c.bounceCount + 1 };
}

/** Stop/void a cheque that is still pending or has bounced (written off). */
export function cancelCheque(c: PostDatedCheque): PostDatedCheque {
  if (c.status !== 'pending' && c.status !== 'bounced') {
    throw new Error(`cannot cancel a cheque in status ${c.status}`);
  }
  return { ...c, status: 'cancelled' };
}

export function applyChequeAction(c: PostDatedCheque, action: ChequeAction): PostDatedCheque {
  switch (action) {
    case 'deposit': return depositCheque(c);
    case 'clear': return clearCheque(c);
    case 'bounce': return bounceCheque(c);
    case 'represent': return representCheque(c);
    case 'cancel': return cancelCheque(c);
    default: throw new Error(`unknown action ${String(action)}`);
  }
}

/** Whole days from `asOf` (YYYY-MM-DD) to maturity; negative once overdue. */
export function daysToMaturity(c: PostDatedCheque, asOf: string): number {
  const ms = Date.parse(`${c.maturityDate}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** A cheque is "live" (still an open obligation) while pending or deposited. */
export function isOpen(c: PostDatedCheque): boolean {
  return c.status === 'pending' || c.status === 'deposited';
}

/**
 * Pending cheques due within `withinDays` (inclusive) — the maturity watch-list.
 * Includes already-overdue pending cheques (negative days) so nothing is missed.
 */
export function isMaturingSoon(c: PostDatedCheque, asOf: string, withinDays = 7): boolean {
  if (c.status !== 'pending') return false;
  return daysToMaturity(c, asOf) <= withinDays;
}

export interface ChequeSummary {
  receivablePending: number; // open received cheques (money coming in)
  payablePending: number; // open issued cheques (money going out)
  maturingSoon: number; // pending cheques due within the watch window
  bounced: number; // currently bounced (unresolved)
}

export function summariseCheques(list: PostDatedCheque[], asOf: string, withinDays = 7): ChequeSummary {
  let receivablePending = 0;
  let payablePending = 0;
  let maturingSoon = 0;
  let bounced = 0;
  for (const c of list) {
    if (isOpen(c)) {
      if (c.direction === 'received') receivablePending += c.amount;
      else payablePending += c.amount;
    }
    if (isMaturingSoon(c, asOf, withinDays)) maturingSoon += 1;
    if (c.status === 'bounced') bounced += 1;
  }
  return {
    receivablePending: Number(receivablePending.toFixed(2)),
    payablePending: Number(payablePending.toFixed(2)),
    maturingSoon,
    bounced,
  };
}

export const POST_DATED_CHEQUE_EVENT = {
  created: 'finance.post_dated_cheque.created',
  statusChanged: 'finance.post_dated_cheque.status_changed',
} as const;
