import type { Id } from '@aura/shared';
import type { ProjectSchedule } from './domain/schedule';
import type { ScheduleStore } from './schedule-store';

export class InMemoryScheduleStore implements ScheduleStore {
  private readonly rows = new Map<string, ProjectSchedule>();
  private clone(s: ProjectSchedule): ProjectSchedule {
    return { ...s, tasks: s.tasks.map((t) => ({ ...t })) };
  }
  async create(s: ProjectSchedule): Promise<void> { this.rows.set(s.id, this.clone(s)); }
  async update(s: ProjectSchedule): Promise<void> { this.rows.set(s.id, this.clone(s)); }
  async get(id: Id): Promise<ProjectSchedule | null> { const s = this.rows.get(id); return s ? this.clone(s) : null; }
  async getByProject(tenantId: Id, projectId: Id): Promise<ProjectSchedule | null> {
    const s = [...this.rows.values()].find((x) => x.tenantId === tenantId && x.projectId === projectId);
    return s ? this.clone(s) : null;
  }
  async list(tenantId: Id): Promise<ProjectSchedule[]> {
    return [...this.rows.values()].filter((x) => x.tenantId === tenantId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
