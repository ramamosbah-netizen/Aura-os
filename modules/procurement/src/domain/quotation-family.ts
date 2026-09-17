import { newId, type Id } from '@aura/shared';

/**
 * QC-01 — a supplier quotation as an immutable family (frozen model).
 *
 * Three levels, because they answer three different questions, and collapsing any two of them
 * destroys information a buyer needs:
 *
 *   FAMILY    this supplier, against this RFQ. One identity however many times they re-quote.
 *   OFFER     a BASE offer, or a technical ALTERNATIVE. A Bosch equivalent beside a Hikvision one is
 *             a different thing being offered, not a cheaper version of the same thing. Modelled as a
 *             revision it would silently replace what it was offered beside.
 *   REVISION  an immutable commercial snapshot. Never updated; a change creates the next one.
 *
 * What this replaces: one mutable row. Rev 0 at AED 100 followed by Rev 1 at AED 92 left a single row
 * saying 92, with no evidence that 100 had ever been offered — and the move from "92 plus freight" to
 * "95 with free freight" is precisely the commercial information a buyer is trying to read.
 */

/**
 * The STORED lifecycle. Expiry is deliberately absent: it is DERIVED from the validity date against
 * the comparison date, because a revision expired today was live on a June comparison and one stored
 * flag cannot say both. Storing it would also give two sources for one fact.
 */
export const REVISION_STATUSES = ['draft', 'received', 'confirmed', 'superseded', 'withdrawn', 'rejected'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

/** Statuses a revision can never leave. Its commercial facts are history at that point. */
const TERMINAL: readonly RevisionStatus[] = ['superseded', 'withdrawn', 'rejected'];

export type OfferKind = 'base' | 'alternative';

/** Where a revision came from. A migrated Rev 0 must never read as though the supplier named it. */
export type RevisionOrigin = 'captured' | 'legacy_migration';

export interface QuotationFamily {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  rfqId: Id;
  /** Canonical supplier. NULL = named in free text only; never backfilled by matching names. */
  supplierId: Id | null;
  supplierName: string;
  /** The SUPPLIER'S own reference ("Q-1001"), as they wrote it. */
  supplierQuotationRef: string | null;
  createdBy: Id | null;
  createdAt: string;
}

export interface QuotationOffer {
  id: Id;
  tenantId: Id;
  familyId: Id;
  kind: OfferKind;
  /** What the alternative IS, in the supplier's terms. Null for a base offer. */
  label: string | null;
  createdBy: Id | null;
  createdAt: string;
}

export interface QuotationRevision {
  id: Id;
  tenantId: Id;
  offerId: Id;
  revisionNo: number;
  supplierRevisionRef: string | null;
  origin: RevisionOrigin;
  receivedAt: string | null;
  quotationDate: string | null;
  validityDate: string | null;
  /** The commercial facts. NULL is UNKNOWN throughout, never a default — SUP-06 depends on that. */
  currency: string | null;
  taxTreatment: 'exclusive' | 'inclusive' | 'exempt' | null;
  taxRatePct: number | null;
  freightAmount: number | null;
  freightTerms: string | null;
  paymentTerms: string | null;
  notes: string | null;
  status: RevisionStatus;
  supersedesRevisionId: Id | null;
  sourceAttachmentId: Id | null;
  createdBy: Id | null;
  createdAt: string;
}

export interface NewQuotationFamily {
  tenantId: Id;
  companyId?: Id | null;
  rfqId: Id;
  supplierId?: Id | null;
  supplierName: string;
  supplierQuotationRef?: string | null;
  createdBy?: Id | null;
}

export function makeQuotationFamily(input: NewQuotationFamily): QuotationFamily {
  if (!input.supplierName?.trim()) throw new Error('a quotation must name the supplier it came from');
  if (!input.rfqId) throw new Error('a quotation must answer an RFQ');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    rfqId: input.rfqId,
    supplierId: input.supplierId ?? null,
    supplierName: input.supplierName.trim(),
    supplierQuotationRef: input.supplierQuotationRef?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function makeQuotationOffer(input: {
  tenantId: Id; familyId: Id; kind?: OfferKind; label?: string | null; createdBy?: Id | null;
}): QuotationOffer {
  const kind = input.kind ?? 'base';
  /**
   * An alternative that does not say what it is cannot be compared against anything by a human. The
   * base offer needs no label because it is the thing that was asked for.
   */
  if (kind === 'alternative' && !input.label?.trim()) {
    throw new Error('an alternative offer must say what is being offered instead');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    familyId: input.familyId,
    kind,
    label: kind === 'alternative' ? input.label!.trim() : null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

export interface NewQuotationRevision {
  tenantId: Id;
  offerId: Id;
  revisionNo: number;
  supplierRevisionRef?: string | null;
  origin?: RevisionOrigin;
  receivedAt?: string | null;
  quotationDate?: string | null;
  validityDate?: string | null;
  currency?: string | null;
  taxTreatment?: 'exclusive' | 'inclusive' | 'exempt' | null;
  taxRatePct?: number | null;
  freightAmount?: number | null;
  freightTerms?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  status?: RevisionStatus;
  supersedesRevisionId?: Id | null;
  sourceAttachmentId?: Id | null;
  createdBy?: Id | null;
}

export function makeQuotationRevision(input: NewQuotationRevision): QuotationRevision {
  if (!Number.isInteger(input.revisionNo) || input.revisionNo < 0) {
    throw new Error('a revision number must be a whole number from zero');
  }
  if (input.taxTreatment === 'inclusive' && (input.taxRatePct ?? null) === null) {
    /**
     * Refused at capture, not left for the comparison to discover. A tax-inclusive price without a
     * rate cannot be put on any basis at all, and the moment to ask is while the supplier's document
     * is still in front of the person typing it.
     */
    throw new Error('a tax-inclusive quotation must state its tax rate, or the price cannot be compared');
  }
  if (input.taxRatePct !== undefined && input.taxRatePct !== null && !(input.taxRatePct >= 0)) {
    throw new Error('a tax rate cannot be negative');
  }
  if (input.freightAmount !== undefined && input.freightAmount !== null && !(input.freightAmount >= 0)) {
    throw new Error('a freight amount cannot be negative');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    offerId: input.offerId,
    revisionNo: input.revisionNo,
    supplierRevisionRef: input.supplierRevisionRef?.trim() || null,
    origin: input.origin ?? 'captured',
    receivedAt: input.receivedAt ?? null,
    quotationDate: input.quotationDate ?? null,
    validityDate: input.validityDate ?? null,
    currency: input.currency?.trim().toUpperCase() || null,
    taxTreatment: input.taxTreatment ?? null,
    taxRatePct: input.taxRatePct ?? null,
    freightAmount: input.freightAmount ?? null,
    freightTerms: input.freightTerms?.trim() || null,
    paymentTerms: input.paymentTerms?.trim() || null,
    notes: input.notes?.trim() || null,
    status: input.status ?? 'draft',
    supersedesRevisionId: input.supersedesRevisionId ?? null,
    sourceAttachmentId: input.sourceAttachmentId ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

/** The next revision number for an offer. Revisions start at 0 and never reuse a number. */
export function nextRevisionNo(existing: QuotationRevision[]): number {
  return existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.revisionNo)) + 1;
}

/**
 * MAY THIS REVISION STILL BE EDITED?
 *
 * Only while it is a draft. Once received, its commercial facts are what the supplier sent, and
 * correcting them by overwriting is how Rev 0 disappeared in the first place. A change to a received
 * revision is a NEW revision.
 */
export function mayEditRevision(revision: QuotationRevision): true | string {
  if (revision.status === 'draft') return true;
  return `revision ${revision.revisionNo} is ${revision.status} and its commercial facts cannot be changed — record the supplier's change as a new revision`;
}

/**
 * THE CONFIRMATION, as a DEMOTE followed by a PROMOTE.
 *
 * Returned as a pair for the caller to apply inside ONE transaction, in this order. The database
 * holds a partial unique index on `status = 'confirmed'`, so promoting before demoting is refused —
 * and that ordering is load-bearing rather than stylistic. SUP-01 learned the same lesson against the
 * same kind of index, in PostgreSQL, after its in-memory tests had all passed.
 *
 * Note what the index does NOT constrain: draft, received, withdrawn and rejected revisions coexist
 * freely, because none of them is the effective offer.
 */
export function confirmRevision(
  next: QuotationRevision,
  current: QuotationRevision | null,
): { demote: QuotationRevision | null; promote: QuotationRevision } {
  if (next.status !== 'received' && next.status !== 'draft') {
    throw new Error(`only a draft or received revision can be confirmed — revision ${next.revisionNo} is ${next.status}`);
  }
  if (current && current.offerId !== next.offerId) {
    throw new Error('a revision can only supersede another revision of the same offer');
  }
  return {
    demote: current ? { ...current, status: 'superseded' } : null,
    promote: { ...next, status: 'confirmed', supersedesRevisionId: current?.id ?? null },
  };
}

/** Withdrawing or rejecting the effective revision leaves the offer with NO effective revision. */
export function retireRevision(revision: QuotationRevision, to: 'withdrawn' | 'rejected'): QuotationRevision {
  if (TERMINAL.includes(revision.status)) {
    throw new Error(`revision ${revision.revisionNo} is already ${revision.status}`);
  }
  return { ...revision, status: to };
}

/**
 * THE COMMERCIALLY EFFECTIVE REVISION, or null.
 *
 * Null is a real and important answer — a family whose latest revision was withdrawn, or one
 * captured and never confirmed, HAS no effective offer. It must not fall back to an earlier
 * revision: suppliers intend a later revision to supersede the commercial offer before it, and
 * quietly reinstating Rev 1 because Rev 2 was pulled would compare a price nobody is offering.
 *
 * Callers must render this null as a visible UNKNOWN. A supplier disappearing from a comparison is
 * the failure nobody notices.
 */
export function effectiveRevision(revisions: QuotationRevision[]): QuotationRevision | null {
  return revisions.find((r) => r.status === 'confirmed') ?? null;
}

/** Why an offer has no effective revision, in words, for a caller that has to explain itself. */
export function noEffectiveRevisionReason(revisions: QuotationRevision[]): string {
  if (revisions.length === 0) return 'no revision has been captured for this offer';
  const latest = [...revisions].sort((a, b) => b.revisionNo - a.revisionNo)[0];
  if (latest.status === 'withdrawn') return `revision ${latest.revisionNo} was withdrawn by the supplier and no earlier revision is reinstated`;
  if (latest.status === 'rejected') return `revision ${latest.revisionNo} was rejected and no earlier revision is reinstated`;
  if (latest.status === 'draft') return `revision ${latest.revisionNo} is still a draft and has not been confirmed`;
  if (latest.status === 'received') return `revision ${latest.revisionNo} has been received but not confirmed`;
  return 'no revision of this offer is commercially effective';
}

export interface RevisionChange {
  field: string;
  from: string | number | null;
  to: string | number | null;
}

/**
 * WHAT CHANGED BETWEEN TWO REVISIONS.
 *
 * Commercially load-bearing rather than cosmetic: a supplier moving from 92 with AED 500 freight to
 * 95 with free freight has restructured the offer, and a buyer who sees only the unit price going UP
 * has read half of it. Line-level changes are not here — this compares the revision header.
 */
export function revisionChanges(from: QuotationRevision, to: QuotationRevision): RevisionChange[] {
  const fields: Array<[string, keyof QuotationRevision]> = [
    ['currency', 'currency'],
    ['tax treatment', 'taxTreatment'],
    ['tax rate %', 'taxRatePct'],
    ['freight amount', 'freightAmount'],
    ['freight terms', 'freightTerms'],
    ['payment terms', 'paymentTerms'],
    ['validity date', 'validityDate'],
    ['quotation date', 'quotationDate'],
  ];
  const changes: RevisionChange[] = [];
  for (const [label, key] of fields) {
    const before = (from[key] ?? null) as string | number | null;
    const after = (to[key] ?? null) as string | number | null;
    if (before !== after) changes.push({ field: label, from: before, to: after });
  }
  return changes;
}
