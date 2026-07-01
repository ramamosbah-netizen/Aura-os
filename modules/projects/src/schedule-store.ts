import type { Id } from '@aura/shared';
import type { ProjectSchedule } from './domain/schedule';

export const SCHEDULE_STORE = Symbol('SCHEDULE_STORE');

export interface ScheduleStore {
  create(s: ProjectSchedule): Promise<void>;
  update(s: ProjectSchedule): Promise<void>;
  get(id: Id): Promise<ProjectSchedule | null>;
  getByProject(tenantId: Id, projectId: Id): Promise<ProjectSchedule | null>;
  list(tenantId: Id): Promise<ProjectSchedule[]>;
}
