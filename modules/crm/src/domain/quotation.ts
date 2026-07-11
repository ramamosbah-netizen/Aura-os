import { type Id, newId } from '@aura/shared';

/**
 * Customer Quotation — the pre-sales quote issued to a prospect/customer (the deal-chain step
 * before a Customer Invoice, and distinct from a formal Tender bid). Carries line items, computes
 * UAE VAT (default 5%), and runs draft → sent → accepted | rejected | expired. On acceptance it's
 * the basis for a contract/invoice. Account/contact are snapshots, not joins.
 */
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface QuotationLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // percent
  lineNet: number;
  lineVat: number;
}

export interface NewQuotationLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
}

export interface Quotation {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  quoteNumber: string;
  customerName: string;
  accountId: Id | null;
  contactName: string | null;
  /** Tender this quotation was generated from (tender pricing sheet), reference not join. */
  sourceTenderId: Id | null;
  issueDate: string; // YYYY-MM-DD
  validUntil: string | null;
  lines: QuotationLine[];
  subtotal: number;
  vatTotal: number;
  total: number;
  status: QuotationStatus;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewQuotation {
  tenantId: Id;
  companyId?: Id | null;
  quoteNumber: string;
  customerName: string;
  accountId?: Id | null;
  contactName?: string | null;
  sourceTenderId?: Id | null;
  issueDate: string;
  validUntil?: string | null;
  lines: NewQuotationLine[];
  createdBy?: Id | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildQuotationLine(input: NewQuotationLine): QuotationLine {
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

export interface QuotationTotals {
  subtotal: number;
  vatTotal: number;
  total: number;
}

export function computeQuotationTotals(lines: QuotationLine[]): QuotationTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineNet, 0));
  const vatTotal = round2(lines.reduce((s, l) => s + l.lineVat, 0));
  return { subtotal, vatTotal, total: round2(subtotal + vatTotal) };
}

export function makeQuotation(input: NewQuotation): Quotation {
  if (!input.quoteNumber?.trim()) throw new Error('quoteNumber is required');
  if (!input.customerName?.trim()) throw new Error('customerName is required');
  if (!input.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) throw new Error('issueDate must be YYYY-MM-DD');
  if (!input.lines || input.lines.length === 0) throw new Error('at least one line item is required');
  const lines = input.lines.map(buildQuotationLine);
  const { subtotal, vatTotal, total } = computeQuotationTotals(lines);
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    quoteNumber: input.quoteNumber.trim(),
    customerName: input.customerName.trim(),
    accountId: input.accountId ?? null,
    contactName: input.contactName ?? null,
    sourceTenderId: input.sourceTenderId ?? null,
    issueDate: input.issueDate,
    validUntil: input.validUntil ?? null,
    lines,
    subtotal,
    vatTotal,
    total,
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export function sendQuotation(q: Quotation): Quotation {
  if (q.status !== 'draft') throw new Error(`cannot send from status ${q.status}`);
  return { ...q, status: 'sent' };
}

export function acceptQuotation(q: Quotation): Quotation {
  if (q.status !== 'sent') throw new Error(`cannot accept from status ${q.status} — must be sent first`);
  return { ...q, status: 'accepted' };
}

export function rejectQuotation(q: Quotation): Quotation {
  if (q.status !== 'sent') throw new Error(`cannot reject from status ${q.status} — must be sent first`);
  return { ...q, status: 'rejected' };
}

export function expireQuotation(q: Quotation): Quotation {
  if (q.status === 'accepted' || q.status === 'rejected') throw new Error(`cannot expire a ${q.status} quotation`);
  return { ...q, status: 'expired' };
}

export const QUOTATION_EVENT = {
  created: 'crm.quotation.created',
  sent: 'crm.quotation.sent',
  accepted: 'crm.quotation.accepted',
} as const;
