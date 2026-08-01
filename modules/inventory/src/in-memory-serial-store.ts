import type { Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { SerialStore } from './serial-store';
import type { SerialUnit } from './domain/serial-unit';

export class InMemorySerialStore implements SerialStore {
  private readonly units = new Map<string, SerialUnit>();

  async save(unit: SerialUnit): Promise<void> {
    this.units.set(unit.id, { ...unit });
  }

  async find(id: string, tenantId: string): Promise<SerialUnit | null> {
    const u = this.units.get(id);
    return u && u.tenantId === tenantId ? { ...u } : null;
  }

  async list(tenantId: string, filter?: { status?: string; projectId?: string; itemCode?: string }): Promise<SerialUnit[]> {
    return [...this.units.values()]
      .filter((u) => u.tenantId === tenantId
        && (!filter?.status || u.status === filter.status)
        && (!filter?.projectId || u.projectId === filter.projectId)
        && (!filter?.itemCode || u.itemCode === filter.itemCode))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listPaged(tenantId: string, page: PageParams, filter?: { status?: string; projectId?: string }): Promise<Page<SerialUnit>> {
    const all = await this.list(tenantId, filter);
    return makePage(all.slice(page.offset, page.offset + page.limit), all.length, page);
  }
}
