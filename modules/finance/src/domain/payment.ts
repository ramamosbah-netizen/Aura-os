import { type Id, newId } from '@aura/shared';

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
    amount: Math.round(amount * 100) / 100,
    reference: input.reference?.trim() || null,
    paidAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}
