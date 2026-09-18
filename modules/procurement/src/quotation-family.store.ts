import type { TxHandle } from '@aura/core';
import type { Id } from '@aura/shared';
import type { QuotationFamily, QuotationOffer, QuotationRevision } from './domain/quotation-family';

/** DI token for the quotation family/offer/revision store (QC-01). */
export const QUOTATION_FAMILY_STORE = Symbol('QUOTATION_FAMILY_STORE');

/**
 * The store for a supplier quotation as an immutable family.
 *
 * Note what is missing on purpose: there is no `updateRevision`. A received revision is a commercial
 * snapshot and is never rewritten — the only writes that touch an existing revision are the status
 * transitions below, which move it between lifecycle states without altering a single commercial
 * fact. Editing a DRAFT is the one exception, and it has its own method so the difference is visible
 * at every call site rather than hidden behind a general-purpose update.
 */
export interface QuotationFamilyStore {
  createFamily(family: QuotationFamily): Promise<void>;
  getFamily(tenantId: Id, id: Id): Promise<QuotationFamily | null>;
  /** Every supplier's quotation family against one RFQ — the read a comparison starts from. */
  listFamiliesByRfq(tenantId: Id, rfqId: Id): Promise<QuotationFamily[]>;
  /** The existing family for this supplier on this RFQ, so re-quoting does not create a second one. */
  findFamily(tenantId: Id, rfqId: Id, supplierId: Id | null, supplierName: string): Promise<QuotationFamily | null>;

  createOffer(offer: QuotationOffer): Promise<void>;
  getOffer(tenantId: Id, id: Id): Promise<QuotationOffer | null>;
  listOffers(tenantId: Id, familyId: Id): Promise<QuotationOffer[]>;

  createRevision(revision: QuotationRevision): Promise<void>;
  getRevision(tenantId: Id, id: Id): Promise<QuotationRevision | null>;
  /** Every revision of one offer, newest first. Superseded ones are included: that is the history. */
  listRevisions(tenantId: Id, offerId: Id): Promise<QuotationRevision[]>;
  /** The commercially effective revision, or null. Null is a real answer, not a miss. */
  findConfirmedRevision(tenantId: Id, offerId: Id): Promise<QuotationRevision | null>;
  /**
   * The same read, INSIDE the caller's transaction and holding the row against change.
   *
   * This is what closes the window between "this recommendation is not stale" and the purchase
   * orders it authorises. Without it a supplier's revision could be confirmed in the gap, and the
   * award would commit on terms that had stopped being current while it was working. `FOR SHARE`
   * lets other readers through and makes a concurrent supersede WAIT for this transaction — so
   * either the confirmation lands first and this read sees it, or it lands after and the award it
   * would have invalidated has already committed on what was true.
   */
  findConfirmedRevisionForAward(tenantId: Id, offerId: Id, tx: TxHandle | null): Promise<QuotationRevision | null>;

  /** Replace a DRAFT revision's commercial facts. Refused by the service for anything else. */
  updateDraftRevision(revision: QuotationRevision): Promise<void>;

  /**
   * THE CONFIRMATION, as one atomic step.
   *
   * Demote then promote, in that order, inside a single transaction. The database holds a partial
   * unique index on `status = 'confirmed'`, so doing it in the other order — or in two separate
   * statements that a failure could interleave — is refused or leaves an offer with two effective
   * revisions. It is one method precisely so no caller can perform half of it.
   */
  applyConfirmation(demote: QuotationRevision | null, promote: QuotationRevision): Promise<void>;

  /** Move a revision to withdrawn or rejected. Commercial facts are untouched. */
  setRevisionStatus(tenantId: Id, id: Id, status: QuotationRevision['status']): Promise<void>;
}
