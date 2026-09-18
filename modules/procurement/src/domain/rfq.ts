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
  /**
   * WHO SENT THE ENQUIRY to suppliers, and when. The act the Buyer could not perform — the role held
   * `procurement.*.read/create/update` and `send` is none of those — and that nobody was recorded as
   * performing when a manager did it instead.
   */
  sentBy: Id | null;
  sentAt: string | null;
}

/**
 * SEND the enquiry. It had no state guard at all: re-sending simply re-set the status and emitted a
 * second `rfqSent` event, so an RFQ could be "sent" any number of times with no record of which one
 * the suppliers answered.
 */
export function sendRfq(rfq: Rfq, sentBy: Id | null = null): Rfq {
  if (rfq.status !== 'draft') {
    throw new Error(`only a draft RFQ can be sent (status ${rfq.status})`);
  }
  return { ...rfq, status: 'sent', sentBy, sentAt: new Date().toISOString() };
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
    sentBy: null,
    sentAt: null,
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
   * A bare number carrying no currency, no tax treatment and no freight — which is why nothing
   * compares it any more and nothing awards from it. The truth is the LINES, and the order is
   * raised from the offer revision an approved recommendation selected (SUP-14). This field
   * survives only because quotations captured before the family model carry it; retiring the
   * legacy quote record itself is separate work.
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

/**
 * `lowestQuote` IS DELETED (SUP-13/SUP-14).
 *
 * It read the legacy header scalar off every quote and returned the smallest one as "the default
 * award recommendation". A bare number carries no currency, no tax treatment and no freight, so the
 * comparison it made was between figures that were never comparable — and calling the result a
 * recommendation gave a sort order the authority of a decision.
 *
 * A recommendation is now a record: a person chose these offers, for this reason, on values
 * normalised to one currency at a stated comparison date, against the technical verdict on every
 * required line — and somebody else approved it. `sourcing-recommendation.ts` owns that, and
 * `no-legacy-award.fitness.test.ts` fails if this function or the header-scalar award returns.
 */

export const RFQ_EVENT = {
  rfqCreated: 'procurement.rfq.created',
  rfqSent: 'procurement.rfq.sent',
  quoteReceived: 'procurement.rfq.quote_received',
  rfqAwarded: 'procurement.rfq.awarded',
} as const;
