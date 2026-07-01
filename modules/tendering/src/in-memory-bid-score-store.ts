import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { BidScore } from './domain/bid-score';
import type { BidScoreFilter, BidScoreStore } from './bid-score-store';

/** Phase-0 bid-score store — keeps scores in memory (no-DB boots). */
export class InMemoryBidScoreStore implements BidScoreStore {
  private readonly scores = new Map<string, BidScore>();

  async save(score: BidScore): Promise<void> {
    this.scores.set(score.id, { ...score });
  }

  async get(id: Id): Promise<BidScore | null> {
    const s = this.scores.get(id);
    return s ? { ...s } : null;
  }

  async list(filter: BidScoreFilter = {}): Promise<BidScore[]> {
    let out = [...this.scores.values()];
    if (filter.tenantId) out = out.filter((s) => s.tenantId === filter.tenantId);
    if (filter.tenderId) out = out.filter((s) => s.tenderId === filter.tenderId);
    if (filter.recommendation) out = out.filter((s) => s.recommendation === filter.recommendation);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: BidScoreFilter, page: PageParams): Promise<Page<BidScore>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
