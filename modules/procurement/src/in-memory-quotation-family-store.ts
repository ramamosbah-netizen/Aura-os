import type { Id } from '@aura/shared';
import type { QuotationFamily, QuotationOffer, QuotationRevision } from './domain/quotation-family';
import type { QuotationFamilyStore } from './quotation-family.store';

/**
 * In-memory quotation families, for runs with no database.
 *
 * It enforces the SAME invariants the PostgreSQL indexes do — one confirmed revision per offer, one
 * base offer per family, one revision number per offer. Not for tidiness: a memory store that is
 * more permissive than the database turns a constraint violation into something that only appears in
 * production, and SUP-01 already lost a day to exactly that gap.
 */
export class InMemoryQuotationFamilyStore implements QuotationFamilyStore {
  private readonly families = new Map<string, QuotationFamily>();
  private readonly offers = new Map<string, QuotationOffer>();
  private readonly revisions = new Map<string, QuotationRevision>();

  async createFamily(family: QuotationFamily): Promise<void> {
    if (family.supplierId) {
      const clash = [...this.families.values()].find(
        (f) => f.tenantId === family.tenantId && f.rfqId === family.rfqId && f.supplierId === family.supplierId,
      );
      if (clash) throw new Error('this supplier already has a quotation against this RFQ');
    }
    this.families.set(family.id, { ...family });
  }

  async getFamily(tenantId: Id, id: Id): Promise<QuotationFamily | null> {
    const f = this.families.get(id);
    return f && f.tenantId === tenantId ? { ...f } : null;
  }

  async listFamiliesByRfq(tenantId: Id, rfqId: Id): Promise<QuotationFamily[]> {
    return [...this.families.values()]
      .filter((f) => f.tenantId === tenantId && f.rfqId === rfqId)
      .map((f) => ({ ...f }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async findFamily(tenantId: Id, rfqId: Id, supplierId: Id | null, supplierName: string): Promise<QuotationFamily | null> {
    const match = [...this.families.values()].find((f) =>
      f.tenantId === tenantId && f.rfqId === rfqId &&
      (supplierId ? f.supplierId === supplierId : f.supplierId === null && f.supplierName === supplierName));
    return match ? { ...match } : null;
  }

  async createOffer(offer: QuotationOffer): Promise<void> {
    if (offer.kind === 'base') {
      const existing = [...this.offers.values()].find(
        (o) => o.tenantId === offer.tenantId && o.familyId === offer.familyId && o.kind === 'base',
      );
      if (existing) throw new Error('this quotation already has a base offer');
    }
    this.offers.set(offer.id, { ...offer });
  }

  async getOffer(tenantId: Id, id: Id): Promise<QuotationOffer | null> {
    const o = this.offers.get(id);
    return o && o.tenantId === tenantId ? { ...o } : null;
  }

  async listOffers(tenantId: Id, familyId: Id): Promise<QuotationOffer[]> {
    return [...this.offers.values()]
      .filter((o) => o.tenantId === tenantId && o.familyId === familyId)
      .map((o) => ({ ...o }))
      // Base first, then alternatives in the order they were recorded.
      .sort((a, b) => (a.kind === b.kind ? a.createdAt.localeCompare(b.createdAt) : a.kind === 'base' ? -1 : 1));
  }

  async createRevision(revision: QuotationRevision): Promise<void> {
    const siblings = [...this.revisions.values()].filter(
      (r) => r.tenantId === revision.tenantId && r.offerId === revision.offerId,
    );
    if (siblings.some((r) => r.revisionNo === revision.revisionNo)) {
      throw new Error(`revision ${revision.revisionNo} already exists for this offer`);
    }
    if (revision.status === 'confirmed' && siblings.some((r) => r.status === 'confirmed')) {
      throw new Error('this offer already has a confirmed revision');
    }
    this.revisions.set(revision.id, { ...revision });
  }

  async getRevision(tenantId: Id, id: Id): Promise<QuotationRevision | null> {
    const r = this.revisions.get(id);
    return r && r.tenantId === tenantId ? { ...r } : null;
  }

  async listRevisions(tenantId: Id, offerId: Id): Promise<QuotationRevision[]> {
    return [...this.revisions.values()]
      .filter((r) => r.tenantId === tenantId && r.offerId === offerId)
      .map((r) => ({ ...r }))
      .sort((a, b) => b.revisionNo - a.revisionNo);
  }

  async findConfirmedRevision(tenantId: Id, offerId: Id): Promise<QuotationRevision | null> {
    const match = [...this.revisions.values()].find(
      (r) => r.tenantId === tenantId && r.offerId === offerId && r.status === 'confirmed',
    );
    return match ? { ...match } : null;
  }

  async updateDraftRevision(revision: QuotationRevision): Promise<void> {
    const existing = this.revisions.get(revision.id);
    if (!existing || existing.tenantId !== revision.tenantId) throw new Error('revision not found');
    if (existing.status !== 'draft') throw new Error('only a draft revision may be edited');
    this.revisions.set(revision.id, { ...revision, status: 'draft' });
  }

  async applyConfirmation(demote: QuotationRevision | null, promote: QuotationRevision): Promise<void> {
    // Demote FIRST, exactly as the transaction does, so the one-confirmed rule cannot be broken
    // even momentarily — and so a test that gets the order wrong fails here rather than in Postgres.
    if (demote) this.revisions.set(demote.id, { ...demote, status: 'superseded' });
    const clash = [...this.revisions.values()].find(
      (r) => r.tenantId === promote.tenantId && r.offerId === promote.offerId && r.status === 'confirmed' && r.id !== promote.id,
    );
    if (clash) throw new Error('this offer already has a confirmed revision');
    this.revisions.set(promote.id, { ...promote, status: 'confirmed' });
  }

  async setRevisionStatus(tenantId: Id, id: Id, status: QuotationRevision['status']): Promise<void> {
    const existing = this.revisions.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('revision not found');
    this.revisions.set(id, { ...existing, status });
  }
}
