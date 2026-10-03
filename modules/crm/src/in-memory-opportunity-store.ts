import type { Id, Opportunity, Page, PageParams, QualificationAtAward } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { OpportunityFilter, OpportunityStore } from './opportunity-store';

export class InMemoryOpportunityStore implements OpportunityStore {
  private readonly opportunities = new Map<string, Opportunity>();

  async create(opportunity: Opportunity): Promise<void> {
    this.opportunities.set(opportunity.id, { ...opportunity });
  }

  async createWithClient(_tx: TxHandle | null, opportunity: Opportunity): Promise<void> {
    return this.create(opportunity);
  }

  async update(opportunity: Opportunity): Promise<void> {
    const stored = this.opportunities.get(opportunity.id);
    this.opportunities.set(opportunity.id, {
      ...opportunity,
      // ADR-0020 — mirror the Postgres store: the generic update does NOT write the snapshot column,
      // so an in-memory test cannot pass while the real store would refuse the same write. Whatever
      // was captured stays captured, whatever the caller's entity happens to be carrying.
      qualificationAtAward: stored ? stored.qualificationAtAward : opportunity.qualificationAtAward,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Write-once, exactly like the SQL `WHERE qualification_at_award IS NULL`. */
  async stampQualificationAtAward(_tx: TxHandle | null, id: Id, snapshot: QualificationAtAward): Promise<boolean> {
    const stored = this.opportunities.get(id);
    if (!stored || stored.qualificationAtAward) return false;
    this.opportunities.set(id, { ...stored, qualificationAtAward: snapshot });
    return true;
  }

  async updateWithClient(_tx: TxHandle | null, opportunity: Opportunity): Promise<void> {
    return this.update(opportunity);
  }

  async get(id: Id): Promise<Opportunity | null> {
    const o = this.opportunities.get(id);
    return o ? { ...o } : null;
  }

  async list(filter: OpportunityFilter = {}): Promise<Opportunity[]> {
    let out = [...this.opportunities.values()];
    if (filter.tenantId) out = out.filter((o) => o.tenantId === filter.tenantId);
    if (filter.stage) out = out.filter((o) => o.stage === filter.stage);
    if (filter.leadId) out = out.filter((o) => o.leadId === filter.leadId);
    if (filter.accountId) out = out.filter((o) => o.accountId === filter.accountId);
    if (filter.ownerId) out = out.filter((o) => o.ownerId === filter.ownerId);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: OpportunityFilter, page: PageParams): Promise<Page<Opportunity>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
