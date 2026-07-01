import { type Id, newId } from '@aura/shared';

/**
 * Customer (AR / sales) Invoice — the bill *raised to a client*, the receivable side that
 * mirrors the supplier (AP) Invoice. A tax invoice carries line items, computes UAE VAT
 * (default 5%), and tracks receipts: draft → issued → partially_paid → paid (or cancelled).
 * Customer / project are snapshots, not joins (same philosophy as the AP invoice).
 */
export type CustomerInvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled';

export interface CustomerInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // percent, e.g. 5
  lineNet: number; // quantity * unitPrice
  lineVat: number; // lineNet * vatRate/100
}

export interface NewCustomerInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
}

export interface CustomerInvoice {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  invoiceNumber: string;
  customerName: string;
  projectId: Id | null;
  projectName: string | null;
  contractRef: string | null;
  issueDate: string; // YYYY-MM-DD
  dueDate: string | null;
  lines: CustomerInvoiceLine[];
  subtotal: number;
  vatTotal: number;
  total: number;
  /** Invoice currency (ISO). Line amounts/total are in this currency. */
  currency: string;
  /** Rate to the base currency (AED): baseTotal = total × exchangeRate. 1 for base-currency invoices. */
  exchangeRate: number;
  /** Total converted to base currency (AED) for consolidated reporting. */
  baseTotal: number;
  amountPaid: number;
  status: CustomerInvoiceStatus;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewCustomerInvoice {
  tenantId: Id;
  companyId?: Id | null;
  invoiceNumber: string;
  customerName: string;
  projectId?: Id | null;
  projectName?: string | null;
  contractRef?: string | null;
  issueDate: string;
  dueDate?: string | null;
  lines: NewCustomerInvoiceLine[];
  currency?: string;
  exchangeRate?: number;
  createdBy?: Id | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildLine(input: NewCustomerInvoiceLine): CustomerInvoiceLine {
  const qty = Number(input.quantity);
  const price = Number(input.unitPrice);
  const vatRate = input.vatRate === undefined ? 5 : Number(input.vatRate);
  if (!input.description?.trim()) throw new Error('line description is required');
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('line quantity must be positive');
  if (!Number.isFinite(price) || price < 0) throw new Error('line unit price cannot be negative');
  if (!Number.isFinite(vatRate) || vatRate < 0) throw new Error('line vat rate cannot be negative');
  const lineNet = round2(qty * price);
  return { description: input.description.trim(), quantity: qty, unitPrice: price, vatRate, lineNet, lineVat: round2(lineNet * (vatRate / 100)) };
}

export interface InvoiceTotals {
  subtotal: number;
  vatTotal: number;
  total: number;
}

export function computeTotals(lines: CustomerInvoiceLine[]): InvoiceTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineNet, 0));
  const vatTotal = round2(lines.reduce((s, l) => s + l.lineVat, 0));
  return { subtotal, vatTotal, total: round2(subtotal + vatTotal) };
}

export function makeCustomerInvoice(input: NewCustomerInvoice): CustomerInvoice {
  if (!input.invoiceNumber?.trim()) throw new Error('invoiceNumber is required');
  if (!input.customerName?.trim()) throw new Error('customerName is required');
  if (!input.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) throw new Error('issueDate must be YYYY-MM-DD');
  if (!input.lines || input.lines.length === 0) throw new Error('at least one line item is required');
  const lines = input.lines.map(buildLine);
  const { subtotal, vatTotal, total } = computeTotals(lines);
  const currency = (input.currency ?? 'AED').trim().toUpperCase();
  const exchangeRate = input.exchangeRate === undefined ? 1 : Number(input.exchangeRate);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error('exchangeRate must be positive');
  if (currency === 'AED' && exchangeRate !== 1) throw new Error('base-currency (AED) invoices must have exchangeRate 1');
  const baseTotal = round2(total * exchangeRate);
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    invoiceNumber: input.invoiceNumber.trim(),
    customerName: input.customerName.trim(),
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    contractRef: input.contractRef ?? null,
    issueDate: input.issueDate,
    dueDate: input.dueDate ?? null,
    lines,
    subtotal,
    vatTotal,
    total,
    currency,
    exchangeRate,
    baseTotal,
    amountPaid: 0,
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export function issueInvoice(inv: CustomerInvoice): CustomerInvoice {
  if (inv.status !== 'draft') throw new Error(`cannot issue from status ${inv.status}`);
  return { ...inv, status: 'issued' };
}

/** Record a customer receipt against an issued invoice; advances to partially_paid / paid. */
export function recordReceipt(inv: CustomerInvoice, amount: number): CustomerInvoice {
  if (inv.status !== 'issued' && inv.status !== 'partially_paid') {
    throw new Error(`cannot record a receipt from status ${inv.status}`);
  }
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) throw new Error('receipt amount must be positive');
  const amountPaid = round2(inv.amountPaid + a);
  if (amountPaid > inv.total + 0.001) throw new Error(`receipt exceeds invoice balance (paid ${inv.amountPaid}, total ${inv.total})`);
  const status: CustomerInvoiceStatus = amountPaid >= inv.total - 0.001 ? 'paid' : 'partially_paid';
  return { ...inv, amountPaid, status };
}

export function cancelInvoice(inv: CustomerInvoice): CustomerInvoice {
  if (inv.status === 'paid') throw new Error('cannot cancel a fully paid invoice');
  if (inv.amountPaid > 0) throw new Error('cannot cancel an invoice with receipts recorded');
  return { ...inv, status: 'cancelled' };
}

export function balanceOf(inv: CustomerInvoice): number {
  return round2(inv.total - inv.amountPaid);
}

export const CUSTOMER_INVOICE_EVENT = {
  created: 'finance.customer_invoice.created',
  issued: 'finance.customer_invoice.issued',
  receiptRecorded: 'finance.customer_invoice.receipt_recorded',
} as const;
