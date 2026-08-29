import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { Activity } from './domain/activity';
import type { ActivityFilter, ActivityStore, ActivitySummary } from './activity-store';

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
    if (filter.assigneeId) out = out.filter((a) => a.assigneeId === filter.assigneeId);
    if (filter.createdBy) out = out.filter((a) => a.createdBy === filter.createdBy);
    if (filter.relatedType) out = out.filter((a) => a.relatedType === filter.relatedType);
    if (filter.relatedId) out = out.filter((a) => a.relatedId === filter.relatedId);
    if (filter.status) out = out.filter((a) => a.status === filter.status);
    if (filter.type) out = out.filter((a) => a.type === filter.type);
    if (filter.search) {
      const q = filter.search.trim().toLowerCase();
      if (q) out = out.filter((a) => [a.subject, a.notes, a.relatedName, a.counterparty, a.assigneeId].some((value) => value?.toLowerCase().includes(q)));
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: ActivityFilter, page: PageParams): Promise<Page<Activity>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }

  async listAll(filter: ActivityFilter = {}): Promise<Activity[]> {
    return this.list({ ...filter, limit: undefined });
  }

  async summary(filter: ActivityFilter = {}, now = new Date()): Promise<ActivitySummary> {
    const all = await this.listAll(filter);
    const today = now.toISOString().slice(0, 10);
    const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const open = all.filter((a) => a.status === 'open' || a.status === 'in_progress');
    return {
      total: all.length,
      open: open.length,
      overdue: open.filter((a) => a.dueDate && a.dueDate < today).length,
      dueToday: open.filter((a) => a.dueDate === today).length,
      dueThisWeek: open.filter((a) => a.dueDate && a.dueDate > today && a.dueDate <= weekEnd).length,
      completed30: all.filter((a) => a.status === 'completed' && (a.completedAt ?? a.createdAt) >= monthAgo).length,
      unassigned: open.filter((a) => !a.assigneeId).length,
    };
  }
}
