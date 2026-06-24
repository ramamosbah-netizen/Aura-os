import type { Id } from '@aura/shared';
import type { Project } from './domain/project';

/** DI token for the project store. */
export const PROJECT_STORE = Symbol('PROJECT_STORE');

export interface ProjectFilter {
  tenantId?: string;
  status?: string;
  accountId?: string;
  contractId?: string;
  limit?: number;
}

export interface ProjectStore {
  create(project: Project): Promise<void>;
  get(id: Id): Promise<Project | null>;
  list(filter?: ProjectFilter): Promise<Project[]>;
}
