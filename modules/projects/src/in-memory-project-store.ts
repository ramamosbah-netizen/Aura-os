import type { Id } from '@aura/shared';
import type { Project } from './domain/project';
import type { ProjectFilter, ProjectStore } from './project-store';

/** Phase-0 project store — keeps projects in memory (no-DB boots). */
export class InMemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, Project>();

  async create(project: Project): Promise<void> {
    this.projects.set(project.id, { ...project });
  }

  async get(id: Id): Promise<Project | null> {
    const p = this.projects.get(id);
    return p ? { ...p } : null;
  }

  async list(filter: ProjectFilter = {}): Promise<Project[]> {
    let out = [...this.projects.values()];
    if (filter.tenantId) out = out.filter((p) => p.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((p) => p.status === filter.status);
    if (filter.accountId) out = out.filter((p) => p.accountId === filter.accountId);
    if (filter.contractId) out = out.filter((p) => p.contractId === filter.contractId);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
