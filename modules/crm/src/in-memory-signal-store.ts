import type { Id, Page, PageParams, Signal, SignalStatus } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { SignalFilter, SignalStore } from './signal-store';

/** Phase-0 signal store — keeps signals in memory (no-DB boots). */
export class InMemorySignalStore implements SignalStore {
  private readonly signals = new Map<string, Signal>();

  async create(s: Signal): Promise<void> {
    this.signals.set(s.id, { ...s });
  }
  async createWithClient(_tx: TxHandle | null, s: Signal): Promise<void> {
    return this.create(s);
  }
  async update(s: Signal): Promise<void> {
    this.signals.set(s.id, { ...s, updatedAt: new Date().toISOString() });
  }
  async updateWithClient(_tx: TxHandle | null, s: Signal): Promise<void> {
    return this.update(s);
  }
  async get(id: Id): Promise<Signal | null> {
    const s = this.signals.get(id);
    return s ? { ...s } : null;
  }
  async getForTenant(tenantId: string, id: Id): Promise<Signal | null> {
    const s = this.signals.get(id);
    return s && s.tenantId === tenantId ? { ...s } : null;
  }
  async getForUpdateWithClient(_tx: TxHandle | null, tenantId: string, id: Id): Promise<Signal | null> {
    return this.getForTenant(tenantId, id);
  }
  async list(filter: SignalFilter = {}): Promise<Signal[]> {
    let out = [...this.signals.values()];
    if (filter.tenantId) out = out.filter((s) => s.tenantId === filter.tenantId);
    if (filter.statuses?.length) out = out.filter((s) => filter.statuses!.includes(s.status));
    else if (filter.status) out = out.filter((s) => s.status === filter.status);
    if (filter.source) out = out.filter((s) => s.source === filter.source);
    if (filter.type) out = out.filter((s) => s.type === filter.type);
    if (filter.ownerId) out = out.filter((s) => s.ownerId === filter.ownerId);
    if (filter.accountId) out = out.filter((s) => s.accountId === filter.accountId);
    if (filter.contextType) out = out.filter((s) => s.contextType === filter.contextType);
    if (filter.contextId) out = out.filter((s) => s.contextId === filter.contextId);
    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      out = out.filter((s) => `${s.title} ${s.description ?? ''} ${s.accountName ?? ''} ${s.evidence ?? ''}`.toLowerCase().includes(q));
    }
    if (filter.detectedFrom) out = out.filter((s) => s.detectedAt >= filter.detectedFrom!);
    if (filter.detectedTo) out = out.filter((s) => s.detectedAt <= filter.detectedTo!);
    if (filter.confidenceMin !== undefined) out = out.filter((s) => s.confidence >= filter.confidenceMin!);
    if (filter.confidenceMax !== undefined) out = out.filter((s) => s.confidence <= filter.confidenceMax!);
    if (filter.dedupeKey) out = out.filter((s) => s.dedupeKey === filter.dedupeKey);
    const dir = filter.direction === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      if (filter.sort === 'confidence') return (a.confidence - b.confidence) * dir || a.id.localeCompare(b.id);
      if (filter.sort === 'title') return a.title.localeCompare(b.title) * dir || a.id.localeCompare(b.id);
      const detected = a.detectedAt > b.detectedAt ? -1 : a.detectedAt < b.detectedAt ? 1 : a.id.localeCompare(b.id);
      return detected * dir;
    });
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
  async listPaged(filter: SignalFilter, page: PageParams): Promise<Page<Signal>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }

  async exportAll(filter: SignalFilter = {}): Promise<Signal[]> { return this.list({ ...filter, limit: undefined }); }

  async summary(filter: SignalFilter = {}) {
    const all = await this.exportAll(filter);
    const tally = (key: (s: Signal) => string) => {
      const m = new Map<string, number>(); for (const s of all) m.set(key(s), (m.get(key(s)) ?? 0) + 1);
      return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    };
    const statuses = new Set<SignalStatus>(['NEW', 'REVIEWING', 'RESEARCHING']);
    return { total: all.length, open: all.filter((s) => statuses.has(s.status)).length,
      new: all.filter((s) => s.status === 'NEW').length, reviewing: all.filter((s) => s.status === 'REVIEWING').length,
      researching: all.filter((s) => s.status === 'RESEARCHING').length, promoted: all.filter((s) => s.status === 'PROMOTED').length,
      dismissed: all.filter((s) => s.status === 'DISMISSED' || s.status === 'DUPLICATE').length,
      highPotential: all.filter((s) => s.confidence >= 70 && statuses.has(s.status)).length,
      bySource: tally((s) => s.source), byType: tally((s) => s.type) };
  }
}
