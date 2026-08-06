import { type Id, newId } from '@aura/shared';
import {
  type CustomerInvoiceLine,
  type NewCustomerInvoiceLine,
  buildLine,
  computeTotals,
} from './customer-invoice';

/**
 * AR Credit Note — a credit memo raised against a customer (sales) invoice. It is how a receivable
 * is *reduced* after the invoice has been issued: over-billing, a return, a price adjustment, or
 * crediting an invoice that is already partly paid (so it cannot simply be cancelled). It carries
 * the same line/VAT shape as the invoice it credits.
 *
 * On issue it is the mirror image of an invoice in the GL — Dr Revenue + Dr VAT Output / Cr
 * Accounts Receivable — and it reduces what the customer owes on the target invoice.
 *
 *   draft → issued (→ cancelled while still draft)
 */
export type CreditNoteStatus = 'draft' | 'issued' | 'cancelled';

export interface CreditNote {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  creditNoteNumber: string;
  /** The customer invoice this note credits (a reference/snapshot, not a join). */
  customerInvoiceId: Id;
  invoiceNumber: string | null;
  customerName: string;
  reason: string;
  issueDate: string; // YYYY-MM-DD
  lines: CustomerInvoiceLine[];
  subtotal: number;
  vatTotal: number;
  total: number;
  currency: string;
  exchangeRate: number;
  baseTotal: number;
  status: CreditNoteStatus;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewCreditNote {
  tenantId: Id;
  companyId?: Id | null;
  creditNoteNumber: string;
  customerInvoiceId: Id;
  invoiceNumber?: string | null;
  customerName: string;
  reason?: string;
  issueDate: string;
  lines: NewCustomerInvoiceLine[];
  currency?: string;
  exchangeRate?: number;
  createdBy?: Id | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function makeCreditNote(input: NewCreditNote): CreditNote {
  if (!input.creditNoteNumber?.trim()) throw new Error('creditNoteNumber is required');
  if (!input.customerInvoiceId?.trim()) throw new Error('customerInvoiceId is required');
  if (!input.customerName?.trim()) throw new Error('customerName is required');
  if (!input.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) throw new Error('issueDate must be YYYY-MM-DD');
  if (!input.lines || input.lines.length === 0) throw new Error('at least one line item is required');
  const lines = input.lines.map(buildLine);
  const { subtotal, vatTotal, total } = computeTotals(lines);
  const currency = (input.currency ?? 'AED').trim().toUpperCase();
  const exchangeRate = input.exchangeRate === undefined ? 1 : Number(input.exchangeRate);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error('exchangeRate must be positive');
  if (currency === 'AED' && exchangeRate !== 1) throw new Error('base-currency (AED) credit notes must have exchangeRate 1');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    creditNoteNumber: input.creditNoteNumber.trim(),
    customerInvoiceId: input.customerInvoiceId,
    invoiceNumber: input.invoiceNumber ?? null,
    customerName: input.customerName.trim(),
    reason: input.reason?.trim() ?? '',
    issueDate: input.issueDate,
    lines,
    subtotal,
    vatTotal,
    total,
    currency,
    exchangeRate,
    baseTotal: round2(total * exchangeRate),
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Issue a draft credit note — the point it posts to the GL and reduces the receivable. */
export function issueCreditNote(cn: CreditNote): CreditNote {
  if (cn.status !== 'draft') throw new Error(`only a draft credit note can be issued (this one is ${cn.status})`);
  return { ...cn, status: 'issued' };
}

/** Void a credit note — permitted only while it is still a draft (an issued note has hit the books). */
export function cancelCreditNote(cn: CreditNote): CreditNote {
  if (cn.status === 'issued') throw new Error('cannot cancel an issued credit note — it has posted to the ledger');
  return { ...cn, status: 'cancelled' };
}

export const CREDIT_NOTE_EVENT = {
  created: 'finance.credit_note.created',
  issued: 'finance.credit_note.issued',
  cancelled: 'finance.credit_note.cancelled',
} as const;
