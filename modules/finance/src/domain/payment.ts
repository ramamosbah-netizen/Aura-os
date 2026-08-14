import { type Id, newId, moneyNumber } from '@aura/shared';

export interface Payment {
  id: Id;
  tenantId: Id;
  invoiceId: Id;
  bankAccountId: Id;
  amount: number;
  reference: string | null;
  paidAt: string;
  createdBy: Id | null;
}

export interface NewPayment {
  tenantId: Id;
  invoiceId: Id;
  bankAccountId: Id;
  amount: number;
  reference?: string | null;
  createdBy?: Id | null;
  /**
   * When the money actually left the account (ISO). Defaults to now.
   *
   * There was no way to set this, so every payment was stamped with the moment it was ENTERED.
   * Bank reconciliation matches on a ±7-day window, so a statement reconciled even a fortnight
   * late could never match anything: the payments all carried today's date. Back-dated entry is
   * the normal case at month end.
   */
  paidAt?: string | null;
}

/**
 * A supplier payment.
 *
 * The amount used to be coerced: a non-finite input silently became **0**, so a bad request
 * produced a zero-value payment record against a real invoice — money recorded as paid, nothing
 * recorded as moving — and a negative amount was stored as-is. Every other maker in this module
 * throws on bad input; this one quietly invented a number. It now rejects, like its siblings.
 */
export function makePayment(input: NewPayment): Payment {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) throw new Error('payment amount must be a number');
  if (amount <= 0) throw new Error(`payment amount must be positive (got ${amount})`);
  return {
    id: newId(),
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    bankAccountId: input.bankAccountId,
    amount: moneyNumber(amount),
    reference: input.reference?.trim() || null,
    paidAt: input.paidAt || new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}
