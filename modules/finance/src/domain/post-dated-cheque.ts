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
 * (→ deposited) or written off (→ cancelled); a pending cheque can be cancelled (stop payment).
 * `bounceCount` counts BOUNCES — incremented when the bank returns it, not when it is
 * re-presented. The maturity watch-list surfaces pending cheques coming due.
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

/**
 * Returned unpaid by the bank — and THIS is what increments the bounce count.
 *
 * The counter used to be incremented on re-presentation instead, which counted the wrong event: a
 * cheque that bounced once and was then written off reported ZERO bounces, and a cheque that
 * bounced twice reported one. In the UAE a returned cheque is a legal and credit matter, and the
 * per-customer bounce history is what a credit decision is made on — under-reporting it is not a
 * cosmetic error.
 */
export function bounceCheque(c: PostDatedCheque): PostDatedCheque {
  if (c.status !== 'deposited') throw new Error(`only a deposited cheque can bounce (status ${c.status})`);
  return { ...c, status: 'bounced', bounceCount: c.bounceCount + 1 };
}

/** Re-present a bounced cheque — back to the bank. The bounce was already counted when it bounced. */
export function representCheque(c: PostDatedCheque): PostDatedCheque {
  if (c.status !== 'bounced') throw new Error(`only a bounced cheque can be re-presented (status ${c.status})`);
  return { ...c, status: 'deposited' };
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
  /** Open RECEIVED cheques in the base currency (money coming in). */
  receivablePending: number;
  /** Open ISSUED cheques in the base currency (money going out). */
  payablePending: number;
  maturingSoon: number; // pending cheques due within the watch window
  bounced: number; // currently bounced (unresolved)
  /** Per-currency breakdown of the same open cheques, so nothing is hidden by the base-currency totals. */
  byCurrency: Record<string, { receivablePending: number; payablePending: number }>;
}

/**
 * Summarise a cheque book as of a date.
 *
 * The headline totals are **single-currency**. They used to add every open cheque together
 * regardless of denomination, so an AED 100,000 cheque and a USD 10,000 cheque produced "110,000"
 * — a number in no currency at all, shown on a cash-position card. A pure function has no exchange
 * rates, so rather than invent a conversion it now totals the base currency and exposes every
 * other currency in `byCurrency` for the caller to convert or display separately.
 */
export function summariseCheques(
  list: PostDatedCheque[],
  asOf: string,
  withinDays = 7,
  baseCurrency = 'AED',
): ChequeSummary {
  const base = baseCurrency.trim().toUpperCase();
  let receivablePending = 0;
  let payablePending = 0;
  let maturingSoon = 0;
  let bounced = 0;
  const byCurrency: ChequeSummary['byCurrency'] = {};
  for (const c of list) {
    if (isOpen(c)) {
      const ccy = (c.currency || base).trim().toUpperCase();
      byCurrency[ccy] ??= { receivablePending: 0, payablePending: 0 };
      if (c.direction === 'received') {
        byCurrency[ccy].receivablePending += c.amount;
        if (ccy === base) receivablePending += c.amount;
      } else {
        byCurrency[ccy].payablePending += c.amount;
        if (ccy === base) payablePending += c.amount;
      }
    }
    if (isMaturingSoon(c, asOf, withinDays)) maturingSoon += 1;
    if (c.status === 'bounced') bounced += 1;
  }
  for (const ccy of Object.keys(byCurrency)) {
    byCurrency[ccy].receivablePending = Number(byCurrency[ccy].receivablePending.toFixed(2));
    byCurrency[ccy].payablePending = Number(byCurrency[ccy].payablePending.toFixed(2));
  }
  return {
    receivablePending: Number(receivablePending.toFixed(2)),
    payablePending: Number(payablePending.toFixed(2)),
    maturingSoon,
    bounced,
    byCurrency,
  };
}

export const POST_DATED_CHEQUE_EVENT = {
  created: 'finance.post_dated_cheque.created',
  statusChanged: 'finance.post_dated_cheque.status_changed',
} as const;
