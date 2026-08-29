import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Quotation } from './domain/quotation';
import type { QuotationFilter, QuotationStore, QuotationSummary } from './quotation-store';

export class InMemoryQuotationStore implements QuotationStore {
  private readonly data = new Map<string, Quotation>();

  async save(q: Quotation): Promise<void> {
    this.data.set(q.id, { ...q, lines: q.lines.map((l) => ({ ...l })) });
  }

  /** No real transaction in-memory — writes are sequential (the NullTxRunner passes tx=null). */
  async saveWithClient(_tx: TxHandle | null, q: Quotation): Promise<void> {
    return this.save(q);
  }

  async get(id: Id): Promise<Quotation | null> {
    const q = this.data.get(id);
    return q ? { ...q, lines: q.lines.map((l) => ({ ...l })) } : null;
  }

  async getForTenant(tenantId: string, id: Id): Promise<Quotation | null> {
    const q = await this.get(id);
    return q?.tenantId === tenantId ? q : null;
  }

  async getForTenantForUpdate(_tx: TxHandle, tenantId: string, id: Id): Promise<Quotation | null> {
    // In-memory mode has no concurrent database transaction; preserve the same tenant-scoped
    // contract so service tests exercise the authorization path without pretending to lock.
    return this.getForTenant(tenantId, id);
  }

  async list(filter: QuotationFilter = {}): Promise<Quotation[]> {
    let out = [...this.data.values()];
    if (filter.tenantId) out = out.filter((q) => q.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((q) => q.status === filter.status);
    if (filter.accountId) out = out.filter((q) => q.accountId === filter.accountId);
    if (filter.ownerId) out = out.filter((q) => q.ownerId === filter.ownerId);
    if (filter.search?.trim()) {
      const needle = filter.search.trim().toLowerCase();
      out = out.filter((q) => [q.quoteNumber, q.customerName, q.subject, q.contactName].some((value) => value?.toLowerCase().includes(needle)));
    }
    if (filter.issueDateFrom) out = out.filter((q) => q.issueDate >= filter.issueDateFrom!);
    if (filter.issueDateTo) out = out.filter((q) => q.issueDate <= filter.issueDateTo!);
    if (filter.sourceTenderId) out = out.filter((q) => q.sourceTenderId === filter.sourceTenderId);
    if (filter.sourceOpportunityId) out = out.filter((q) => q.sourceOpportunityId === filter.sourceOpportunityId);
    if (filter.quoteNumber) out = out.filter((q) => q.quoteNumber === filter.quoteNumber);
    out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async streamAll(filter: QuotationFilter, onBatch: (rows: Quotation[]) => Promise<void>): Promise<void> {
    const rows = await this.list({ ...filter, limit: undefined });
    for (let offset = 0; offset < rows.length; offset += 500) await onBatch(rows.slice(offset, offset + 500));
  }

  async listPaged(filter: QuotationFilter, page: PageParams): Promise<Page<Quotation>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }

  async summary(filter: QuotationFilter): Promise<QuotationSummary> {
    const quotes = await this.list({ ...filter, limit: undefined });
    const value = (statuses: string[]) => quotes.filter((q) => statuses.includes(q.status)).reduce((sum, q) => sum + q.total, 0);
    const count = (statuses: string[]) => quotes.filter((q) => statuses.includes(q.status)).length;
    const accepted = count(['accepted']);
    const lost = count(['rejected', 'expired', 'cancelled']);
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const stage = (statuses: string[]) => ({ count: count(statuses), value: value(statuses) });
    return {
      total: quotes.length,
      totalValue: quotes.reduce((sum, q) => sum + q.total, 0),
      draftValue: value(['draft', 'internal_review', 'approved']),
      openValue: value(['sent', 'under_negotiation', 'negotiation']),
      acceptedValue: value(['accepted']),
      lostValue: value(['rejected', 'expired', 'cancelled']),
      acceptedCount: accepted,
      decidedCount: accepted + lost,
      expiringSoon: quotes.filter((q) => ['draft', 'internal_review', 'approved', 'sent', 'under_negotiation', 'negotiation'].includes(q.status) && q.validUntil && q.validUntil >= today && q.validUntil <= soon).length,
      pendingApproval: count(['internal_review']),
      stage: {
        draft: stage(['draft']), review: stage(['internal_review']), approved: stage(['approved']), sent: stage(['sent']),
        negotiation: stage(['under_negotiation', 'negotiation']), accepted: stage(['accepted']), lost: stage(['rejected', 'expired', 'cancelled']),
      },
      sources: {
        opportunity: quotes.filter((q) => Boolean(q.sourceOpportunityId)).length,
        tender: quotes.filter((q) => Boolean(q.sourceTenderId) && !q.sourceOpportunityId).length,
        direct: quotes.filter((q) => !q.sourceOpportunityId && !q.sourceTenderId).length,
      },
    };
  }
}
