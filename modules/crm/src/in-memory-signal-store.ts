import type { Id, Page, PageParams, Signal } from '@aura/shared';
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
  async list(filter: SignalFilter = {}): Promise<Signal[]> {
    let out = [...this.signals.values()];
    if (filter.tenantId) out = out.filter((s) => s.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((s) => s.status === filter.status);
    if (filter.source) out = out.filter((s) => s.source === filter.source);
    if (filter.accountId) out = out.filter((s) => s.accountId === filter.accountId);
    if (filter.dedupeKey) out = out.filter((s) => s.dedupeKey === filter.dedupeKey);
    out.sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
  async listPaged(filter: SignalFilter, page: PageParams): Promise<Page<Signal>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
