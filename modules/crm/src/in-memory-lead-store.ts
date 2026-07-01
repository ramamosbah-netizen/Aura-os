import type { Id, Lead, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { LeadFilter, LeadStore } from './lead-store';

export class InMemoryLeadStore implements LeadStore {
  private readonly leads = new Map<string, Lead>();

  async create(lead: Lead): Promise<void> {
    this.leads.set(lead.id, { ...lead });
  }

  async createWithClient(_tx: TxHandle | null, lead: Lead): Promise<void> {
    return this.create(lead);
  }

  async update(lead: Lead): Promise<void> {
    this.leads.set(lead.id, { ...lead, updatedAt: new Date().toISOString() });
  }

  async get(id: Id): Promise<Lead | null> {
    const l = this.leads.get(id);
    return l ? { ...l } : null;
  }

  async list(filter: LeadFilter = {}): Promise<Lead[]> {
    let out = [...this.leads.values()];
    if (filter.tenantId) out = out.filter((l) => l.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((l) => l.status === filter.status);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: LeadFilter, page: PageParams): Promise<Page<Lead>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
