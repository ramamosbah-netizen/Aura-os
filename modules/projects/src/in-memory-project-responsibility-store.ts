import type { Id } from '@aura/shared';
import type { ProjectResponsibility } from './domain/project-responsibility';
import type { ProjectResponsibilityFilter, ProjectResponsibilityStore } from './project-responsibility-store';

export class InMemoryProjectResponsibilityStore implements ProjectResponsibilityStore {
  private readonly rows = new Map<Id, ProjectResponsibility>();
  async create(value: ProjectResponsibility): Promise<void> { this.rows.set(value.id, { ...value }); }
  async update(value: ProjectResponsibility, expectedUpdatedAt?: string): Promise<boolean> {
    const current = this.rows.get(value.id);
    if (!current || (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt)) return false;
    this.rows.set(value.id, { ...value });
    return true;
  }
  async get(id: Id): Promise<ProjectResponsibility | null> { const row = this.rows.get(id); return row ? { ...row } : null; }
  async list(filter: ProjectResponsibilityFilter): Promise<ProjectResponsibility[]> {
    let rows = [...this.rows.values()].filter((row) => row.tenantId === filter.tenantId);
    if (filter.projectId) rows = rows.filter((row) => row.projectId === filter.projectId);
    if (filter.assigneeId) rows = rows.filter((row) => row.assigneeId === filter.assigneeId);
    if (filter.openOnly) rows = rows.filter((row) => row.status !== 'completed');
    rows.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.updatedAt.localeCompare(a.updatedAt));
    return rows.slice(0, filter.limit ?? rows.length).map((row) => ({ ...row }));
  }
}
