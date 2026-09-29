import { type Id, moneyNumber, newId, sumMoney } from '@aura/shared';

/**
 * A CUSTOMER RECEIPT — money received against an issued invoice, as a record of its own (AR-INV-02).
 *
 * It used to exist only as a running total: recording a receipt added to the invoice's `amount_paid`
 * and nothing else, so who recorded which receipt, when the money arrived, for how much and against
 * what bank reference existed nowhere a screen or a reconciliation could read. Two receipts of 5,000
 * and one of 10,000 were indistinguishable.
 *
 * Now each receipt is a row, and the invoice's `amountPaid` is DERIVED from them (`amountPaidFrom`) —
 * in PostgreSQL by the receipts trigger of migration 0400, which also refuses any other writer setting
 * the total. There are no longer two numbers that can disagree.
 *
 * A receipt is never edited or deleted. A receipt written by migration 0400 for money recorded before
 * receipts were records is `legacy`: it carries the amount the old total held and nothing else,
 * because nobody recorded the rest and inventing it would manufacture evidence.
 */
export interface CustomerReceipt {
  id: Id;
  tenantId: Id;
  invoiceId: Id;
  amount: number;
  /** The date the money was received (YYYY-MM-DD). Null only on a legacy receipt. */
  receivedOn: string | null;
  /** The bank reference it reconciles to — transfer id, cheque number. Null only on a legacy receipt. */
  bankReference: string | null;
  recordedBy: Id | null;
  /** When it was recorded. Null only on a legacy receipt, whose recording time nobody kept. */
  recordedAt: string | null;
  legacy: boolean;
}

export interface NewCustomerReceipt {
  tenantId: Id;
  invoiceId: Id;
  amount: number;
  receivedOn: string;
  bankReference: string;
  recordedBy?: Id | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function makeCustomerReceipt(input: NewCustomerReceipt): CustomerReceipt {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('receipt amount must be positive');
  const receivedOn = String(input.receivedOn ?? '').trim();
  if (!ISO_DATE.test(receivedOn) || Number.isNaN(Date.parse(`${receivedOn}T00:00:00Z`))) {
    throw new Error('a receipt requires the date the money was received (YYYY-MM-DD)');
  }
  const bankReference = String(input.bankReference ?? '').trim();
  if (!bankReference) {
    throw new Error('a receipt requires the bank reference it reconciles to — the transfer id or cheque number');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    amount: moneyNumber(amount),
    receivedOn,
    bankReference,
    recordedBy: input.recordedBy ?? null,
    recordedAt: new Date().toISOString(),
    legacy: false,
  };
}

/** The invoice's paid amount IS this sum — there is no other source for it. */
export function amountPaidFrom(receipts: readonly Pick<CustomerReceipt, 'amount'>[]): number {
  return Number(sumMoney(receipts.map((r) => r.amount)));
}
