import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { makeEvent, type Id } from '@aura/shared';
import {
  confirmRevision,
  effectiveRevision,
  makeQuotationFamily,
  makeQuotationOffer,
  makeQuotationRevision,
  mayEditRevision,
  nextRevisionNo,
  noEffectiveRevisionReason,
  retireRevision,
  revisionChanges,
  type NewQuotationRevision,
  type QuotationFamily,
  type QuotationOffer,
  type QuotationRevision,
  type RevisionChange,
} from './domain/quotation-family';
import { QUOTATION_FAMILY_STORE, type QuotationFamilyStore } from './quotation-family.store';

/**
 * QC-01 stage A — capturing a supplier quotation without destroying the one before it.
 *
 * Every write here is an APPEND. There is no path through this service that rewrites a received
 * revision's commercial facts: a supplier's change becomes the next revision, and the previous one
 * stays readable. That is the whole point of the record — Rev 0 at AED 100 followed by Rev 1 at AED
 * 92 used to leave a single row saying 92.
 *
 * It owns the lifecycle and nothing else. It does not compare, normalise, rank or recommend: SUP-06
 * reads the effective revision and SUP-13 decides what to do about it.
 */
export const QUOTATION_EVENT = {
  familyOpened: 'procurement.quotation.family_opened',
  revisionCaptured: 'procurement.quotation.revision_captured',
  revisionConfirmed: 'procurement.quotation.revision_confirmed',
  revisionRetired: 'procurement.quotation.revision_retired',
} as const;

export interface RevisionHistoryEntry {
  revision: QuotationRevision;
  /** What moved between this revision and the one before it. Empty on the first. */
  changesFromPrevious: RevisionChange[];
}

export interface OfferWithHistory {
  offer: QuotationOffer;
  /** The commercially effective revision, or null with a sentence saying why. */
  effective: QuotationRevision | null;
  noEffectiveReason: string | null;
  history: RevisionHistoryEntry[];
}

@Injectable()
export class QuotationCaptureService {
  private readonly logger = new Logger('QuotationCapture');

  constructor(
    @Inject(QUOTATION_FAMILY_STORE) private readonly store: QuotationFamilyStore,
    @Optional() @Inject(EVENT_STORE) private readonly events: EventStore | null = null,
  ) {}

  private async emit(type: string, tenantId: Id, aggregateId: Id, actorId: Id | null, payload: Record<string, unknown>): Promise<void> {
    if (!this.events) return;
    await this.events.append([makeEvent({
      type, tenantId, companyId: null, actorId,
      aggregateType: 'procurement.quotation', aggregateId, payload,
    })]);
  }

  /**
   * Open a supplier's quotation against an RFQ, or return the one they already have.
   *
   * Re-quoting must not create a second family: that is how one supplier ends up occupying several
   * positions in a comparison. A supplier sending a revised quotation is adding a revision to the
   * offer they already made, not making a new quotation.
   */
  async openFamily(input: {
    tenantId: Id; companyId?: Id | null; rfqId: Id; supplierId?: Id | null;
    supplierName: string; supplierQuotationRef?: string | null; createdBy?: Id | null;
  }): Promise<{ family: QuotationFamily; baseOffer: QuotationOffer; reused: boolean }> {
    const existing = await this.store.findFamily(
      input.tenantId, input.rfqId, input.supplierId ?? null, input.supplierName.trim(),
    );
    if (existing) {
      const offers = await this.store.listOffers(input.tenantId, existing.id);
      const base = offers.find((o) => o.kind === 'base');
      if (base) return { family: existing, baseOffer: base, reused: true };
      // A family with no base offer is a half-built record; complete it rather than refuse.
      const repaired = makeQuotationOffer({ tenantId: input.tenantId, familyId: existing.id, createdBy: input.createdBy });
      await this.store.createOffer(repaired);
      return { family: existing, baseOffer: repaired, reused: true };
    }

    const family = makeQuotationFamily(input);
    await this.store.createFamily(family);
    const baseOffer = makeQuotationOffer({ tenantId: input.tenantId, familyId: family.id, createdBy: input.createdBy });
    await this.store.createOffer(baseOffer);

    await this.emit(QUOTATION_EVENT.familyOpened, family.tenantId, family.id, family.createdBy, {
      rfqId: family.rfqId, supplierName: family.supplierName, supplierQuotationRef: family.supplierQuotationRef,
    });
    this.logger.log(`Quotation opened: ${family.supplierName} against RFQ ${family.rfqId}`);
    return { family, baseOffer, reused: false };
  }

  /**
   * Add a technical ALTERNATIVE to a quotation.
   *
   * Separate from a revision on purpose: a Bosch equivalent offered beside a Hikvision one is a
   * different thing being offered, and recording it as a revision would let it silently replace what
   * it was offered beside.
   */
  async addAlternativeOffer(tenantId: Id, familyId: Id, label: string, createdBy?: Id | null): Promise<QuotationOffer> {
    const family = await this.store.getFamily(tenantId, familyId);
    if (!family) throw new Error(`quotation ${familyId} not found`);
    const offer = makeQuotationOffer({ tenantId, familyId, kind: 'alternative', label, createdBy });
    await this.store.createOffer(offer);
    this.logger.log(`Alternative offer "${offer.label}" added to ${family.supplierName}'s quotation`);
    return offer;
  }

  /** Start the next revision of an offer, as a DRAFT the buyer can still correct. */
  async startRevision(input: Omit<NewQuotationRevision, 'revisionNo' | 'status'>): Promise<QuotationRevision> {
    const offer = await this.store.getOffer(input.tenantId, input.offerId);
    if (!offer) throw new Error(`quotation offer ${input.offerId} not found`);
    const existing = await this.store.listRevisions(input.tenantId, input.offerId);
    const revision = makeQuotationRevision({ ...input, revisionNo: nextRevisionNo(existing), status: 'draft' });
    await this.store.createRevision(revision);
    return revision;
  }

  /** Correct a DRAFT. Anything else is refused in words that say what to do instead. */
  async editDraft(tenantId: Id, revisionId: Id, patch: Partial<NewQuotationRevision>): Promise<QuotationRevision> {
    const existing = await this.store.getRevision(tenantId, revisionId);
    if (!existing) throw new Error(`quotation revision ${revisionId} not found`);
    const permitted = mayEditRevision(existing);
    if (permitted !== true) throw new Error(permitted);

    // Rebuilt through the factory so a draft cannot be edited into a state the factory would refuse
    // — a tax-inclusive price whose rate was deleted, for instance.
    const rebuilt = makeQuotationRevision({
      tenantId, offerId: existing.offerId, revisionNo: existing.revisionNo,
      supplierRevisionRef: patch.supplierRevisionRef ?? existing.supplierRevisionRef,
      origin: existing.origin,
      receivedAt: patch.receivedAt ?? existing.receivedAt,
      quotationDate: patch.quotationDate ?? existing.quotationDate,
      validityDate: patch.validityDate ?? existing.validityDate,
      currency: patch.currency ?? existing.currency,
      taxTreatment: patch.taxTreatment ?? existing.taxTreatment,
      taxRatePct: patch.taxRatePct ?? existing.taxRatePct,
      freightAmount: patch.freightAmount ?? existing.freightAmount,
      freightTerms: patch.freightTerms ?? existing.freightTerms,
      paymentTerms: patch.paymentTerms ?? existing.paymentTerms,
      notes: patch.notes ?? existing.notes,
      sourceAttachmentId: patch.sourceAttachmentId ?? existing.sourceAttachmentId,
      status: 'draft',
    });
    const updated = { ...rebuilt, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy };
    await this.store.updateDraftRevision(updated);
    return updated;
  }

  /** Mark a draft as RECEIVED: this is what the supplier sent, and it stops being editable. */
  async markReceived(tenantId: Id, revisionId: Id, actorId?: Id | null): Promise<QuotationRevision> {
    const revision = await this.store.getRevision(tenantId, revisionId);
    if (!revision) throw new Error(`quotation revision ${revisionId} not found`);
    if (revision.status !== 'draft') {
      throw new Error(`revision ${revision.revisionNo} is ${revision.status} and cannot be received again`);
    }
    await this.store.setRevisionStatus(tenantId, revisionId, 'received');
    await this.emit(QUOTATION_EVENT.revisionCaptured, tenantId, revisionId, actorId ?? null, {
      offerId: revision.offerId, revisionNo: revision.revisionNo, currency: revision.currency,
    });
    return { ...revision, status: 'received' };
  }

  /**
   * MAKE A REVISION THE COMMERCIALLY EFFECTIVE ONE.
   *
   * Demote then promote, handed to the store as a single atomic step. The database holds a partial
   * unique index on `status = 'confirmed'`, so the order is enforced rather than merely intended.
   */
  async confirm(tenantId: Id, revisionId: Id, actorId?: Id | null): Promise<QuotationRevision> {
    const next = await this.store.getRevision(tenantId, revisionId);
    if (!next) throw new Error(`quotation revision ${revisionId} not found`);
    const current = await this.store.findConfirmedRevision(tenantId, next.offerId);
    if (current?.id === next.id) return next;

    const { demote, promote } = confirmRevision(next, current);
    await this.store.applyConfirmation(demote, promote);
    await this.emit(QUOTATION_EVENT.revisionConfirmed, tenantId, promote.id, actorId ?? null, {
      offerId: promote.offerId, revisionNo: promote.revisionNo, supersededRevisionId: demote?.id ?? null,
    });
    this.logger.log(`Revision ${promote.revisionNo} confirmed${demote ? `, superseding ${demote.revisionNo}` : ''}`);
    return promote;
  }

  /**
   * The supplier withdraws an offer, or AURA rejects it.
   *
   * Retiring the effective revision leaves the offer with NO effective revision — an earlier one is
   * never reinstated, because a supplier who pulls Rev 2 has not thereby re-offered Rev 1. The offer
   * then appears in a comparison as a visible UNKNOWN rather than disappearing from it.
   */
  async retire(tenantId: Id, revisionId: Id, to: 'withdrawn' | 'rejected', actorId?: Id | null): Promise<QuotationRevision> {
    const revision = await this.store.getRevision(tenantId, revisionId);
    if (!revision) throw new Error(`quotation revision ${revisionId} not found`);
    const retired = retireRevision(revision, to);
    await this.store.setRevisionStatus(tenantId, revisionId, to);
    await this.emit(QUOTATION_EVENT.revisionRetired, tenantId, revisionId, actorId ?? null, {
      offerId: revision.offerId, revisionNo: revision.revisionNo, to,
    });
    return retired;
  }

  /** One supplier's quotation in full: every offer, its effective revision, and its history. */
  async readFamily(tenantId: Id, familyId: Id): Promise<{ family: QuotationFamily; offers: OfferWithHistory[] }> {
    const family = await this.store.getFamily(tenantId, familyId);
    if (!family) throw new Error(`quotation ${familyId} not found`);

    const offers: OfferWithHistory[] = [];
    for (const offer of await this.store.listOffers(tenantId, family.id)) {
      const revisions = await this.store.listRevisions(tenantId, offer.id);
      const effective = effectiveRevision(revisions);
      // Oldest first for the diff, so each entry compares against the revision before it.
      const chronological = [...revisions].sort((a, b) => a.revisionNo - b.revisionNo);
      offers.push({
        offer,
        effective,
        noEffectiveReason: effective ? null : noEffectiveRevisionReason(revisions),
        history: chronological.map((revision, i) => ({
          revision,
          changesFromPrevious: i === 0 ? [] : revisionChanges(chronological[i - 1], revision),
        })).reverse(),
      });
    }
    return { family, offers };
  }

  /** Every supplier's quotation against one RFQ, each with its effective revision and history. */
  async readByRfq(tenantId: Id, rfqId: Id): Promise<Array<{ family: QuotationFamily; offers: OfferWithHistory[] }>> {
    const families = await this.store.listFamiliesByRfq(tenantId, rfqId);
    const out = [];
    for (const family of families) out.push(await this.readFamily(tenantId, family.id));
    return out;
  }
}
