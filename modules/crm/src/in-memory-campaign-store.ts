import type { CampaignStore } from './campaign-store';
import type { Campaign } from './domain/campaign';

export class InMemoryCampaignStore implements CampaignStore {
  private readonly rows = new Map<string, Campaign>();
  async save(c: Campaign): Promise<void> { this.rows.set(c.id, { ...c }); }
  async find(id: string, tenantId: string): Promise<Campaign | null> {
    const c = this.rows.get(id);
    return c && c.tenantId === tenantId ? { ...c } : null;
  }
  async list(tenantId: string, status?: string): Promise<Campaign[]> {
    return [...this.rows.values()]
      .filter((c) => c.tenantId === tenantId && (!status || c.status === status))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
