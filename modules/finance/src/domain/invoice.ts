import { type Id, newId, convertMoney } from '@aura/shared';

// Finance domain — framework-free. A (supplier / AP) Invoice is raised against a Purchase
// Order — the "pay" step that closes the operate loop (spend -> receive -> pay). It
// REFERENCES the PO by id + title snapshot and carries the supplier + project snapshots
// down from it — no cross-module join.

export type InvoiceStatus = 'draft' | 'approved' | 'paid' | 'cancelled';

export interface Invoice {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** Invoice number / reference. */
  reference: string | null;
  /** What is being invoiced. */
  title: string;
  /** The PO this invoice bills against — reference + snapshot, not a join. */
  poId: Id | null;
  poTitle: string | null;
  /** Carried down from the PO — snapshots, not joins. */
  supplierName: string | null;
  projectId: Id | null;
  projectName: string | null;
  wbsNodeId: Id | null;
  status: InvoiceStatus;
  /** Invoice amount (in `currency`). */
  value: number;
  /** Invoice currency (ISO); value is in this currency. */
  currency: string;
  /** Rate to base (AED): baseValue = value × exchangeRate. 1 for base-currency invoices. */
  exchangeRate: number;
  baseValue: number;
  /**
   * The date the SUPPLIER issued the invoice, which is the date its rate is governed at — not the
   * date it was typed in. Null on rows booked before FX-01, where it is genuinely unknown.
   */
  invoiceDate: string | null;
  /** WHICH governed rate valued this (FX-01). Null = booked before provenance existed. */
  exchangeRateEffectiveDate: string | null;
  exchangeRateSource: string | null;
  exchangeRateId: string | null;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewInvoice {
  tenantId: Id;
  companyId?: Id | null;
  reference?: string | null;
  title: string;
  poId?: Id | null;
  poTitle?: string | null;
  supplierName?: string | null;
  projectId?: Id | null;
  projectName?: string | null;
  wbsNodeId?: Id | null;
  status?: InvoiceStatus;
  value?: number;
  currency?: string;
  exchangeRate?: number;
  invoiceDate?: string | null;
  exchangeRateEffectiveDate?: string | null;
  exchangeRateSource?: string | null;
  exchangeRateId?: string | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

/** The company base currency. Everything is valued in this; an invoice in it needs no rate. */
const BASE_CURRENCY = 'AED';

export function makeInvoice(input: NewInvoice): Invoice {
  const currency = (input.currency ?? BASE_CURRENCY).trim().toUpperCase();
  /**
   * A FOREIGN-CURRENCY INVOICE CANNOT BE CONSTRUCTED WITHOUT A RATE (FX-01).
   *
   * This used to default a missing rate to 1, so a EUR 100,000 invoice booked AED 100,000 if the
   * service ever failed to resolve one. The service now refuses first, and this is the invariant
   * underneath it: the domain will not produce a base value nobody can justify. It lives inside the
   * command handler's transaction, so tripping it rolls the whole create back.
   */
  const rateGiven = input.exchangeRate !== undefined && Number.isFinite(Number(input.exchangeRate));
  if (currency !== BASE_CURRENCY && !rateGiven) {
    throw new Error(`an invoice in ${currency} cannot be booked without a governed exchange rate to ${BASE_CURRENCY}`);
  }
  if (rateGiven && !(Number(input.exchangeRate) > 0)) {
    throw new Error('an exchange rate must be a positive number');
  }
  const exchangeRate = rateGiven ? Number(input.exchangeRate) : 1;
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    poId: input.poId ?? null,
    poTitle: input.poTitle ?? null,
    supplierName: input.supplierName?.trim() || null,
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    wbsNodeId: input.wbsNodeId ?? null,
    status: input.status ?? 'draft',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    currency,
    exchangeRate,
    baseValue: Number(convertMoney(Number.isFinite(input.value) ? Number(input.value) : 0, exchangeRate)),
    invoiceDate: input.invoiceDate ?? null,
    exchangeRateEffectiveDate: input.exchangeRateEffectiveDate ?? null,
    exchangeRateSource: input.exchangeRateSource ?? null,
    exchangeRateId: input.exchangeRateId ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Finance events on the spine. */
export const FINANCE_EVENT = {
  invoiceCreated: 'finance.invoice.created',
  invoiceUpdated: 'finance.invoice.updated',
  invoiceApproved: 'finance.invoice.approved',
  invoicePaid: 'finance.invoice.paid',
  paymentRecorded: 'finance.payment.recorded',
  journalPosted: 'finance.journal.posted',
} as const;
