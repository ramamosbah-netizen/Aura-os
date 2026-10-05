import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { Rfq, RfqInvitation, RfqQuote } from './domain/rfq';
import type { RfqFilter, RfqStore } from './rfq-store';

/** Phase-0 RFQ store — keeps RFQs + quotes in memory (no-DB boots). */
export class InMemoryRfqStore implements RfqStore {
  private readonly rfqs = new Map<string, Rfq>();
  private readonly quotes = new Map<string, RfqQuote>();
  // Insertion-ordered, so the list reads in the order suppliers were invited.
  private readonly invitations = new Map<string, RfqInvitation>();

  async create(rfq: Rfq): Promise<void> {
    this.rfqs.set(rfq.id, { ...rfq });
  }

  async update(rfq: Rfq): Promise<void> {
    this.rfqs.set(rfq.id, { ...rfq });
  }

  async get(id: Id): Promise<Rfq | null> {
    const r = this.rfqs.get(id);
    return r ? { ...r } : null;
  }

  async list(filter: RfqFilter = {}): Promise<Rfq[]> {
    let out = [...this.rfqs.values()];
    if (filter.tenantId) out = out.filter((r) => r.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((r) => r.status === filter.status);
    if (filter.prId) out = out.filter((r) => r.prId === filter.prId);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listByPrIds(tenantId: string, prIds: readonly string[]): Promise<Rfq[]> {
    const wanted = new Set<string>(prIds);
    return [...this.rfqs.values()]
      .filter((r) => r.tenantId === tenantId && r.prId !== null && wanted.has(r.prId))
      .map((r) => ({ ...r }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async listPaged(filter: RfqFilter, page: PageParams): Promise<Page<Rfq>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }

  async addQuote(quote: RfqQuote): Promise<void> {
    this.quotes.set(quote.id, { ...quote });
  }

  async updateQuote(quote: RfqQuote): Promise<void> {
    this.quotes.set(quote.id, { ...quote });
  }

  async getQuote(id: Id): Promise<RfqQuote | null> {
    const q = this.quotes.get(id);
    return q ? { ...q } : null;
  }

  async listQuotes(rfqId: Id): Promise<RfqQuote[]> {
    return [...this.quotes.values()]
      .filter((q) => q.rfqId === rfqId)
      .sort((a, b) => a.amount - b.amount);
  }

  async addInvitation(invitation: RfqInvitation): Promise<void> {
    const taken = [...this.invitations.values()].some(
      (i) => i.tenantId === invitation.tenantId && i.rfqId === invitation.rfqId && i.supplierId === invitation.supplierId,
    );
    // The database's unique index, kept here so a no-DB boot refuses the same duplicate.
    if (taken) throw new Error(`${invitation.supplierName} is already invited to this enquiry`);
    this.invitations.set(invitation.id, { ...invitation });
  }

  async removeInvitation(rfqId: Id, supplierId: Id): Promise<void> {
    for (const [id, i] of this.invitations) {
      if (i.rfqId === rfqId && i.supplierId === supplierId) this.invitations.delete(id);
    }
  }

  async listInvitations(rfqId: Id): Promise<RfqInvitation[]> {
    return [...this.invitations.values()]
      .filter((i) => i.rfqId === rfqId)
      .map((i) => ({ ...i }));
  }
}
