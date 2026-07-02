import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { PostDatedCheque } from './domain/post-dated-cheque';
import type { PostDatedChequeFilter, PostDatedChequeStore } from './post-dated-cheque-store';

export class InMemoryPostDatedChequeStore implements PostDatedChequeStore {
  private readonly data = new Map<string, PostDatedCheque>();

  async save(c: PostDatedCheque): Promise<void> {
    this.data.set(c.id, { ...c });
  }

  async get(id: Id): Promise<PostDatedCheque | null> {
    const c = this.data.get(id);
    return c ? { ...c } : null;
  }

  async list(filter: PostDatedChequeFilter = {}): Promise<PostDatedCheque[]> {
    let out = [...this.data.values()];
    if (filter.tenantId) out = out.filter((c) => c.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((c) => c.status === filter.status);
    if (filter.direction) out = out.filter((c) => c.direction === filter.direction);
    out.sort((a, b) => (a.maturityDate < b.maturityDate ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: PostDatedChequeFilter, page: PageParams): Promise<Page<PostDatedCheque>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
