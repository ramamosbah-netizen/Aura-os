import type { Id } from '@aura/shared';
import type { ProjectCloseout } from './domain/closeout';
import type { CloseoutFilter, CloseoutStore } from './closeout-store';

/** Phase-0 closeout store — keeps project closeouts in memory (no-DB boots). */
export class InMemoryCloseoutStore implements CloseoutStore {
  private readonly rows = new Map<string, ProjectCloseout>();

  async create(c: ProjectCloseout): Promise<void> {
    this.rows.set(c.id, { ...c, items: c.items.map((i) => ({ ...i })) });
  }

  async update(c: ProjectCloseout): Promise<void> {
    this.rows.set(c.id, { ...c, items: c.items.map((i) => ({ ...i })) });
  }

  async get(id: Id): Promise<ProjectCloseout | null> {
    const c = this.rows.get(id);
    return c ? { ...c, items: c.items.map((i) => ({ ...i })) } : null;
  }

  async getByProject(tenantId: Id, projectId: Id): Promise<ProjectCloseout | null> {
    const found = [...this.rows.values()].find((c) => c.tenantId === tenantId && c.projectId === projectId);
    return found ? { ...found, items: found.items.map((i) => ({ ...i })) } : null;
  }

  async list(filter: CloseoutFilter = {}): Promise<ProjectCloseout[]> {
    let out = [...this.rows.values()];
    if (filter.tenantId) out = out.filter((c) => c.tenantId === filter.tenantId);
    if (filter.projectId) out = out.filter((c) => c.projectId === filter.projectId);
    if (filter.status) out = out.filter((c) => c.status === filter.status);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
