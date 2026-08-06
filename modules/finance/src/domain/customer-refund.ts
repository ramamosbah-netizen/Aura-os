import { type Id, newId } from '@aura/shared';

/**
 * Customer refund — cash returned to a customer. It closes out a credit the business owes them: an
 * over-payment, a cancelled order, or a credit note the customer wants paid out rather than applied
 * to a future invoice. Paying it posts Dr Accounts Receivable / Cr Bank (the customer's credit
 * balance is cleared and cash leaves), the mirror of a receipt.
 *
 *   draft → paid (→ cancelled while still draft)
 */
export type CustomerRefundStatus = 'draft' | 'paid' | 'cancelled';

export interface CustomerRefund {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  refundNumber: string;
  customerName: string;
  /** Optional invoice / credit note this refund relates to, for traceability. */
  reference: string | null;
  reason: string;
  amount: number;
  currency: string;
  refundDate: string; // YYYY-MM-DD
  status: CustomerRefundStatus;
  paidAt: string | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewCustomerRefund {
  tenantId: Id;
  companyId?: Id | null;
  refundNumber: string;
  customerName: string;
  reference?: string | null;
  reason?: string;
  amount: number;
  currency?: string;
  refundDate: string;
  createdBy?: Id | null;
}

export function makeCustomerRefund(input: NewCustomerRefund): CustomerRefund {
  if (!input.refundNumber?.trim()) throw new Error('refundNumber is required');
  if (!input.customerName?.trim()) throw new Error('customerName is required');
  if (!input.refundDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.refundDate)) throw new Error('refundDate must be YYYY-MM-DD');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('refund amount must be positive');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    refundNumber: input.refundNumber.trim(),
    customerName: input.customerName.trim(),
    reference: input.reference?.trim() || null,
    reason: input.reason?.trim() ?? '',
    amount: Math.round(amount * 100) / 100,
    currency: (input.currency ?? 'AED').trim().toUpperCase(),
    refundDate: input.refundDate,
    status: 'draft',
    paidAt: null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Pay a draft refund — the point cash leaves and the GL entry posts. */
export function payRefund(refund: CustomerRefund): CustomerRefund {
  if (refund.status !== 'draft') throw new Error(`only a draft refund can be paid (this one is ${refund.status})`);
  return { ...refund, status: 'paid', paidAt: new Date().toISOString() };
}

/** Void a refund — only while still a draft (a paid refund has left the bank). */
export function cancelRefund(refund: CustomerRefund): CustomerRefund {
  if (refund.status === 'paid') throw new Error('cannot cancel a paid refund — the cash has already left');
  return { ...refund, status: 'cancelled' };
}

export const CUSTOMER_REFUND_EVENT = {
  created: 'finance.customer_refund.created',
  paid: 'finance.customer_refund.paid',
  cancelled: 'finance.customer_refund.cancelled',
} as const;
