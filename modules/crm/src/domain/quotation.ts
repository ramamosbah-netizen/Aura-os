import { type Id, newId } from '@aura/shared';
// quotation-pricing has only a type-only dep back on this file, so this value
// import is one-way at runtime — no cycle.
import { type QuotationPricingInput, emptyPricingLine } from './quotation-pricing';

/**
 * Customer Quotation — the pre-sales quote issued to a prospect/customer (the deal-chain step
 * before a Customer Invoice, and distinct from a formal Tender bid). Carries line items, computes
 * UAE VAT (default 5%), and runs draft → sent → accepted | rejected | expired. On acceptance it's
 * the basis for a contract/invoice. Account/contact are snapshots, not joins.
 */
export type QuotationStatus =
  | 'draft'
  | 'internal_review'
  | 'approved'
  | 'sent'
  | 'under_negotiation'
  | 'revised'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled';

/** Statuses a quotation can still move out of (everything else is terminal). */
export const OPEN_QUOTATION_STATUSES: readonly QuotationStatus[] = [
  'draft',
  'internal_review',
  'approved',
  'sent',
  'under_negotiation',
];

/**
 * Governance — the internal pricing sheet is only editable while the quotation is
 * still being worked up. Approval is the commitment point (it also locks the
 * immutable Commercial Baseline, R3), so from `approved` onwards the build-up
 * that justified the price is FROZEN: read, export and print only. Re-pricing
 * means raising a new revision, which starts as a draft with the sheet carried
 * forward and editable again.
 */
export const PRICING_EDITABLE_STATUSES: readonly QuotationStatus[] = ['draft', 'internal_review'];

/** True once the build-up is frozen (approved → sent → … and every terminal state). */
export function isPricingLocked(q: Pick<Quotation, 'status'>): boolean {
  return !PRICING_EDITABLE_STATUSES.includes(q.status);
}

/**
 * Statuses where the quote is a LIVE commitment to the client — a price we are
 * currently standing behind. Distinct from `isPricingLocked`, which asks whether
 * THIS record's own sheet is frozen (true for `revised` and every dead state too,
 * because those are historical records that must never be rewritten).
 *
 * This asks a different question: does a commitment still stand? A superseded
 * (`revised`) quote does not — its successor carries the commitment. Nor do the
 * dead ends (`rejected`/`expired`/`cancelled`). Upstream estimates use this to
 * decide whether the costing behind a live price may still be re-worked.
 */
export const COMMITTED_QUOTATION_STATUSES: readonly QuotationStatus[] = [
  'approved',
  'sent',
  'under_negotiation',
  'accepted',
];

/** True while this quotation still represents a price committed to the client. */
export function isQuotationCommitted(q: Pick<Quotation, 'status'>): boolean {
  return COMMITTED_QUOTATION_STATUSES.includes(q.status);
}

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
  /**
   * What this quote is FOR, in the author's words — "Tower B ELV fit-out", "MOE CCTV upgrade".
   * Not a line item and not the customer: the one phrase that names the job. It travels
   * downstream as the title of the contract and then the project, so the same words a customer
   * saw on the quote are the words the delivery team works under. Null on legacy quotes.
   */
  subject: string | null;
  contactName: string | null;
  /** Tender this quotation was generated from (tender pricing sheet), reference not join. */
  sourceTenderId: Id | null;
  /** Opportunity this quotation was converted from (direct-sale path), reference not join. */
  sourceOpportunityId: Id | null;
  ownerId: Id | null;
  /** Free-form commercial notes. Kept for anything the structured fields below don't capture. */
  terms: string | null;
  /**
   * What the price does NOT include — one line per exclusion. A list, not prose, because an
   * exclusion buried in a paragraph is the one a customer later says they never saw, and a
   * dispute over "does this cover the permits?" is answered by a row, not by re-reading a blob.
   */
  exclusions: string[];
  /** How and when we get paid, e.g. "50% advance, 50% on delivery". */
  paymentConditions: string | null;
  /** When and how we deliver, e.g. "6–8 weeks from PO". */
  deliveryTerms: string | null;
  /** Revision number — Rev 0 is the original; revising supersedes it (status 'revised'). */
  revision: number;
  parentQuotationId: Id | null;
  /** The contract created from this quotation (convert-to-contract), reference not join. */
  convertedContractId: Id | null;
  issueDate: string; // YYYY-MM-DD
  validUntil: string | null;
  lines: QuotationLine[];
  subtotal: number;
  vatTotal: number;
  total: number;
  /** Internal cost sheet (this revision only); null until priced. */
  pricing: QuotationPricingInput | null;
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
  subject?: string | null;
  contactName?: string | null;
  sourceTenderId?: Id | null;
  sourceOpportunityId?: Id | null;
  ownerId?: Id | null;
  terms?: string | null;
  exclusions?: string[];
  paymentConditions?: string | null;
  deliveryTerms?: string | null;
  revision?: number;
  parentQuotationId?: Id | null;
  issueDate: string;
  validUntil?: string | null;
  lines: NewQuotationLine[];
  pricing?: QuotationPricingInput | null;
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

/** Trim each exclusion, drop blanks, and dedupe case-insensitively while keeping first spelling. */
export function normaliseExclusions(raw: string[] | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = item?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
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
    subject: input.subject?.trim() || null,
    contactName: input.contactName ?? null,
    sourceTenderId: input.sourceTenderId ?? null,
    sourceOpportunityId: input.sourceOpportunityId ?? null,
    ownerId: input.ownerId ?? null,
    terms: input.terms?.trim() || null,
    // Trim, drop blanks, dedupe — a checklist of exclusions with "" or a repeat in it reads as
    // sloppy and invites the exact ambiguity the list exists to remove.
    exclusions: normaliseExclusions(input.exclusions),
    paymentConditions: input.paymentConditions?.trim() || null,
    deliveryTerms: input.deliveryTerms?.trim() || null,
    revision: Number.isInteger(input.revision) && input.revision! >= 0 ? input.revision! : 0,
    parentQuotationId: input.parentQuotationId ?? null,
    convertedContractId: null,
    issueDate: input.issueDate,
    validUntil: input.validUntil ?? null,
    lines,
    subtotal,
    vatTotal,
    total,
    // A quotation is born with its pricing sheet: one empty build-up per line,
    // ready to cost. It is never null, so "open the sheet" always works.
    pricing: input.pricing ?? { lines: lines.map(() => emptyPricingLine()) },
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/* ── Lifecycle ────────────────────────────────────────────────────────────
 * Draft → (Internal Review) → Approved → Sent → Under Negotiation →
 * Accepted / Rejected / Expired / Cancelled (+ Revised when superseded by a
 * new revision).
 *
 * COMMERCIAL GOVERNANCE (R3 / G-P1-2): a quotation can NO LONGER be sent to a
 * customer straight from draft — `send` requires `approved`. Approval is the
 * governed gate (an authorized action; it locks an immutable Commercial Baseline).
 * Small quotes are still one step: `approve` is allowed directly from draft (the
 * authorized approver's sign-off IS the review), or two steps via `submit_review`.
 * The invariant is simply: nothing reaches a customer unapproved.
 */

export type QuotationAction =
  | 'submit_review'
  | 'approve'
  | 'send'
  | 'negotiate'
  | 'accept'
  | 'reject'
  | 'expire'
  | 'cancel';

const TRANSITIONS: Record<QuotationAction, { from: readonly QuotationStatus[]; to: QuotationStatus }> = {
  submit_review: { from: ['draft'], to: 'internal_review' },
  approve: { from: ['draft', 'internal_review'], to: 'approved' },
  send: { from: ['approved'], to: 'sent' },
  negotiate: { from: ['sent'], to: 'under_negotiation' },
  accept: { from: ['sent', 'under_negotiation'], to: 'accepted' },
  reject: { from: ['sent', 'under_negotiation'], to: 'rejected' },
  expire: { from: OPEN_QUOTATION_STATUSES, to: 'expired' },
  cancel: { from: OPEN_QUOTATION_STATUSES, to: 'cancelled' },
};

export const QUOTATION_ACTIONS = Object.keys(TRANSITIONS) as QuotationAction[];

export function applyQuotationAction(q: Quotation, action: QuotationAction): Quotation {
  const t = TRANSITIONS[action];
  if (!t) throw new Error(`unknown action ${action}`);
  if (!t.from.includes(q.status)) {
    throw new Error(`cannot ${action.replace('_', ' ')} from status ${q.status}`);
  }
  return { ...q, status: t.to };
}

export function sendQuotation(q: Quotation): Quotation {
  return applyQuotationAction(q, 'send');
}
export function acceptQuotation(q: Quotation): Quotation {
  return applyQuotationAction(q, 'accept');
}
export function rejectQuotation(q: Quotation): Quotation {
  return applyQuotationAction(q, 'reject');
}
export function expireQuotation(q: Quotation): Quotation {
  return applyQuotationAction(q, 'expire');
}

/**
 * Revise a quotation (MEP/ELV price/scope/terms move during negotiation):
 * the current record is superseded (status 'revised', terminal) and a NEW
 * draft is created with revision+1 carrying the same number, account, source
 * references, lines and terms — edit then re-send.
 */
export function reviseQuotation(q: Quotation): { superseded: Quotation; next: Quotation } {
  const revisable: QuotationStatus[] = ['sent', 'under_negotiation', 'rejected', 'expired'];
  if (!revisable.includes(q.status)) {
    throw new Error(`cannot revise from status ${q.status} — must be sent, under negotiation, rejected or expired`);
  }
  const next = makeQuotation({
    tenantId: q.tenantId,
    companyId: q.companyId,
    quoteNumber: q.quoteNumber,
    customerName: q.customerName,
    accountId: q.accountId,
    subject: q.subject,
    contactName: q.contactName,
    sourceTenderId: q.sourceTenderId,
    sourceOpportunityId: q.sourceOpportunityId,
    ownerId: q.ownerId,
    terms: q.terms,
    // The commercial position carries into the revision — a new price does not silently reset
    // what was excluded or how payment was agreed.
    exclusions: q.exclusions,
    paymentConditions: q.paymentConditions,
    deliveryTerms: q.deliveryTerms,
    revision: q.revision + 1,
    parentQuotationId: q.id,
    issueDate: new Date().toISOString().slice(0, 10),
    validUntil: q.validUntil,
    lines: q.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate })),
    // Carry the internal build-up into the new revision — costs rarely reset between revisions.
    pricing: q.pricing ? { lines: q.pricing.lines.map((l) => ({ ...l })) } : null,
    createdBy: q.createdBy,
  });
  return { superseded: { ...q, status: 'revised' }, next };
}

export const QUOTATION_EVENT = {
  created: 'crm.quotation.created',
  sent: 'crm.quotation.sent',
  accepted: 'crm.quotation.accepted',
  statusChanged: 'crm.quotation.status_changed',
  revised: 'crm.quotation.revised',
  updated: 'crm.quotation.updated',
} as const;
