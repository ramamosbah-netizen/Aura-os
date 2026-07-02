import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TenderOutcome } from './domain/win-loss';
import type { TenderOutcomeFilter, TenderOutcomeStore } from './win-loss-store';

/** Phase-0 win/loss store — keeps tender outcomes in memory (no-DB boots). */
export class InMemoryTenderOutcomeStore implements TenderOutcomeStore {
  private readonly outcomes = new Map<string, TenderOutcome>();

  async save(outcome: TenderOutcome): Promise<void> {
    this.outcomes.set(outcome.id, { ...outcome, competitors: outcome.competitors.map((c) => ({ ...c })) });
  }

  async get(id: Id): Promise<TenderOutcome | null> {
    const o = this.outcomes.get(id);
    return o ? { ...o, competitors: o.competitors.map((c) => ({ ...c })) } : null;
  }

  async list(filter: TenderOutcomeFilter = {}): Promise<TenderOutcome[]> {
    let out = [...this.outcomes.values()];
    if (filter.tenantId) out = out.filter((o) => o.tenantId === filter.tenantId);
    if (filter.tenderId) out = out.filter((o) => o.tenderId === filter.tenderId);
    if (filter.result) out = out.filter((o) => o.result === filter.result);
    out.sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1));
    out = out.map((o) => ({ ...o, competitors: o.competitors.map((c) => ({ ...c })) }));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: TenderOutcomeFilter, page: PageParams): Promise<Page<TenderOutcome>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
