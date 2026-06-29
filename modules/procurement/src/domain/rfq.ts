import { type Id, newId } from '@aura/shared';

/**
 * RFQ (Request for Quotation) — the sourcing step between a Purchase Request and a Purchase
 * Order: a buyer floats a requirement to vendors, collects quotes, compares them, and awards
 * the winner (which becomes a PO). RFQ owns its quotes; comparison is "lowest amount wins"
 * by default but the buyer can award any quote.
 */
export type RfqStatus = 'draft' | 'sent' | 'awarded' | 'closed';

export interface Rfq {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  reference: string | null;
  title: string;
  prId: Id | null;
  prTitle: string | null;
  status: RfqStatus;
  dueDate: string | null;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewRfq {
  tenantId: Id;
  companyId?: Id | null;
  reference?: string | null;
  title: string;
  prId?: Id | null;
  prTitle?: string | null;
  status?: RfqStatus;
  dueDate?: string | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeRfq(input: NewRfq): Rfq {
  if (!input.title || !input.title.trim()) throw new Error('RFQ title is required');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    prId: input.prId ?? null,
    prTitle: input.prTitle ?? null,
    status: input.status ?? 'draft',
    dueDate: input.dueDate ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export type RfqQuoteStatus = 'received' | 'rejected' | 'awarded';

export interface RfqQuote {
  id: Id;
  rfqId: Id;
  tenantId: Id;
  supplierName: string;
  amount: number;
  leadTimeDays: number | null;
  notes: string | null;
  status: RfqQuoteStatus;
  createdAt: string;
}

export interface NewRfqQuote {
  rfqId: Id;
  tenantId: Id;
  supplierName: string;
  amount: number;
  leadTimeDays?: number | null;
  notes?: string | null;
  status?: RfqQuoteStatus;
}

export function makeRfqQuote(input: NewRfqQuote): RfqQuote {
  if (!input.supplierName || !input.supplierName.trim()) throw new Error('quote supplier is required');
  if (!(Number(input.amount) > 0)) throw new Error('quote amount must be positive');
  return {
    id: newId(),
    rfqId: input.rfqId,
    tenantId: input.tenantId,
    supplierName: input.supplierName.trim(),
    amount: Number(input.amount),
    leadTimeDays: input.leadTimeDays ?? null,
    notes: input.notes?.trim() || null,
    status: input.status ?? 'received',
    createdAt: new Date().toISOString(),
  };
}

/** The cheapest received quote — the default award recommendation. */
export function lowestQuote(quotes: RfqQuote[]): RfqQuote | null {
  const received = quotes.filter((q) => q.status !== 'rejected');
  if (received.length === 0) return null;
  return received.reduce((best, q) => (q.amount < best.amount ? q : best));
}

export const RFQ_EVENT = {
  rfqCreated: 'procurement.rfq.created',
  rfqSent: 'procurement.rfq.sent',
  quoteReceived: 'procurement.rfq.quote_received',
  rfqAwarded: 'procurement.rfq.awarded',
} as const;
