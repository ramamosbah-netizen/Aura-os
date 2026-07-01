import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Drawing } from './domain/drawing';
import type { DrawingFilter, DrawingStore } from './drawing-store';

export class InMemoryDrawingStore implements DrawingStore {
  private readonly items = new Map<string, Drawing>();

  async create(drawing: Drawing): Promise<void> {
    this.items.set(drawing.id, { ...drawing });
  }

  async createWithClient(tx: TxHandle | null, drawing: Drawing): Promise<void> {
    await this.create(drawing);
  }

  async update(drawing: Drawing): Promise<void> {
    this.items.set(drawing.id, { ...drawing });
  }

  async updateWithClient(tx: TxHandle | null, drawing: Drawing): Promise<void> {
    await this.update(drawing);
  }

  async get(id: Id): Promise<Drawing | null> {
    const found = this.items.get(id);
    return found ? { ...found } : null;
  }

  async getByCode(tenantId: Id, projectId: Id, code: string, revision: string): Promise<Drawing | null> {
    for (const d of this.items.values()) {
      if (d.tenantId === tenantId && d.projectId === projectId && d.code === code && d.revision === revision) {
        return { ...d };
      }
    }
    return null;
  }

  async getLatestByCode(tenantId: Id, projectId: Id, code: string): Promise<Drawing | null> {
    let latest: Drawing | null = null;
    for (const d of this.items.values()) {
      if (d.tenantId === tenantId && d.projectId === projectId && d.code === code) {
        // `>=` so that on identical createdAt timestamps (same-ms creates in a test/fast path)
        // the later-inserted row wins — Map preserves insertion order = creation order.
        if (!latest || new Date(d.createdAt) >= new Date(latest.createdAt)) {
          latest = { ...d };
        }
      }
    }
    return latest;
  }

  async list(filter: DrawingFilter = {}): Promise<Drawing[]> {
    let list = [...this.items.values()];
    if (filter.tenantId) list = list.filter((i) => i.tenantId === filter.tenantId);
    if (filter.projectId) list = list.filter((i) => i.projectId === filter.projectId);
    if (filter.status) list = list.filter((i) => i.status === filter.status);
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? list.slice(0, filter.limit) : list;
  }

  async listPaged(filter: DrawingFilter, page: PageParams): Promise<Page<Drawing>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
