import type { Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { CommissioningStore } from './store.interface';
import type { CommissioningRecord } from './domain/commissioning-record';

/** Dev/test adapter — in-memory, non-persistent. Mirrors the Postgres adapter's ordering. */
export class InMemoryCommissioningStore implements CommissioningStore {
  private readonly records = new Map<string, CommissioningRecord>();

  async save(record: CommissioningRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async find(id: string, tenantId: string): Promise<CommissioningRecord | null> {
    const r = this.records.get(id);
    return r && r.tenantId === tenantId ? { ...r } : null;
  }

  async list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.tenantId === tenantId && (!projectId || r.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>> {
    const all = await this.list(tenantId, projectId);
    const items = all.slice(page.offset, page.offset + page.limit);
    return makePage(items, all.length, page);
  }
}
