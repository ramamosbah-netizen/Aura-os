import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { BidScore } from './domain/bid-score';
import type { BidScoreFilter, BidScoreStore } from './bid-score-store';
import { BidScoreLockedError } from './bid-score-store';

/** Phase-0 bid-score store — keeps scores in memory (no-DB boots). */
export class InMemoryBidScoreStore implements BidScoreStore {
  private readonly scores = new Map<string, BidScore>();

  async save(score: BidScore): Promise<void> {
    if (this.scores.has(score.id) || [...this.scores.values()].some((s) => s.tenantId === score.tenantId && s.tenderId === score.tenderId && !s.supersededAt)) throw new BidScoreLockedError();
    this.scores.set(score.id, structuredClone(score));
  }

  async amend(previousId: Id, replacement: BidScore, actorId: Id): Promise<void> {
    const previous = this.scores.get(previousId);
    if (!previous || previous.tenantId !== replacement.tenantId || previous.tenderId !== replacement.tenderId || previous.supersededAt) {
      throw new BidScoreLockedError();
    }
    if (replacement.supersedesId !== previous.id || !replacement.amendmentReason) throw new BidScoreLockedError();
    const at = replacement.createdAt;
    this.scores.set(previous.id, structuredClone({ ...previous, supersededAt: at, supersededBy: actorId }));
    this.scores.set(replacement.id, structuredClone(replacement));
  }

  async get(id: Id): Promise<BidScore | null> {
    const s = this.scores.get(id);
    return s ? structuredClone(s) : null;
  }

  async list(filter: BidScoreFilter = {}): Promise<BidScore[]> {
    let out = [...this.scores.values()];
    if (filter.tenantId) out = out.filter((s) => s.tenantId === filter.tenantId);
    if (filter.tenderId) out = out.filter((s) => s.tenderId === filter.tenderId);
    if (filter.recommendation) out = out.filter((s) => s.recommendation === filter.recommendation);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return structuredClone(filter.limit ? out.slice(0, filter.limit) : out);
  }

  async listPaged(filter: BidScoreFilter, page: PageParams): Promise<Page<BidScore>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
