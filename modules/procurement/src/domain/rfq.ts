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
  companyId: Id | null;
  /** Retained for quotations recorded before suppliers were linked canonically. */
  supplierName: string;
  /**
   * The canonical supplier this offer came from.
   *
   * A supplier master already existed and the quotation typed a name instead of referencing it —
   * the same defect `BUY-01` fixed for materials. NULL is a legacy quotation, never backfilled by
   * matching names: two suppliers share a name and one supplier gets typed three ways.
   */
  supplierId: Id | null;
  /**
   * LEGACY HEADER SCALAR — one number for the whole offer.
   *
   * It is what `lowestQuote` still compares, and it is why that comparison cannot support a
   * decision: a bare number carries no currency, no tax treatment and no freight. The truth is now
   * the LINES. This field is left in place deliberately rather than removed here: reconciling or
   * retiring it belongs to the commercial-normalisation slice, and removing it now would change the
   * award path this stage is explicitly not touching.
   */
  amount: number;
  /** The currency the offer is made in. NULL is UNKNOWN and is NEVER the base currency. */
  currency: string | null;
  /** 'exclusive' | 'inclusive' | 'exempt'. NULL is UNKNOWN — it changes what the price MEANS. */
  taxTreatment: 'exclusive' | 'inclusive' | 'exempt' | null;
  taxRatePct: number | null;
  /** Freight quoted for the whole offer. Never spread across lines — that allocation is invented. */
  freightAmount: number | null;
  freightTerms: string | null;
  paymentTerms: string | null;
  /** How long the offer stands. An expired quotation is a fact about the offer, not a defect. */
  validityDate: string | null;
  leadTimeDays: number | null;
  notes: string | null;
  status: RfqQuoteStatus;
  createdAt: string;
}

export interface NewRfqQuote {
  rfqId: Id;
  tenantId: Id;
  companyId?: Id | null;
  supplierName: string;
  supplierId?: Id | null;
  amount: number;
  currency?: string | null;
  taxTreatment?: 'exclusive' | 'inclusive' | 'exempt' | null;
  taxRatePct?: number | null;
  freightAmount?: number | null;
  freightTerms?: string | null;
  paymentTerms?: string | null;
  validityDate?: string | null;
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
    companyId: input.companyId ?? null,
    supplierName: input.supplierName.trim(),
    supplierId: input.supplierId ?? null,
    amount: Number(input.amount),
    // NULL throughout is UNKNOWN. None of these defaults to a convenient assumption: an offer with
    // no currency is not in the base currency, and one with no tax treatment is not tax-exclusive.
    currency: input.currency?.trim() || null,
    taxTreatment: input.taxTreatment ?? null,
    taxRatePct: input.taxRatePct ?? null,
    freightAmount: input.freightAmount ?? null,
    freightTerms: input.freightTerms?.trim() || null,
    paymentTerms: input.paymentTerms?.trim() || null,
    validityDate: input.validityDate ?? null,
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
