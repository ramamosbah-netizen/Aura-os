import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { Activity } from './domain/activity';
import type { ActivityFilter, ActivityStore } from './activity-store';

/** Phase-0 activity store — keeps activities in memory (no-DB boots). */
export class InMemoryActivityStore implements ActivityStore {
  private readonly activities = new Map<string, Activity>();

  async save(activity: Activity): Promise<void> {
    this.activities.set(activity.id, { ...activity });
  }

  async get(id: Id): Promise<Activity | null> {
    const a = this.activities.get(id);
    return a ? { ...a } : null;
  }

  async list(filter: ActivityFilter = {}): Promise<Activity[]> {
    let out = [...this.activities.values()];
    if (filter.tenantId) out = out.filter((a) => a.tenantId === filter.tenantId);
    if (filter.relatedType) out = out.filter((a) => a.relatedType === filter.relatedType);
    if (filter.relatedId) out = out.filter((a) => a.relatedId === filter.relatedId);
    if (filter.status) out = out.filter((a) => a.status === filter.status);
    if (filter.type) out = out.filter((a) => a.type === filter.type);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: ActivityFilter, page: PageParams): Promise<Page<Activity>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
