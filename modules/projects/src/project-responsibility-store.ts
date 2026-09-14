import type { Id } from '@aura/shared';
import type { ProjectResponsibility } from './domain/project-responsibility';

export const PROJECT_RESPONSIBILITY_STORE = Symbol('PROJECT_RESPONSIBILITY_STORE');

export interface ProjectResponsibilityFilter {
  tenantId: Id;
  projectId?: Id;
  assigneeId?: Id;
  openOnly?: boolean;
  limit?: number;
}

export interface ProjectResponsibilityStore {
  create(value: ProjectResponsibility): Promise<void>;
  /** Returns false when another writer changed the row after it was loaded. */
  update(value: ProjectResponsibility, expectedUpdatedAt?: string): Promise<boolean>;
  get(id: Id): Promise<ProjectResponsibility | null>;
  list(filter: ProjectResponsibilityFilter): Promise<ProjectResponsibility[]>;
}
