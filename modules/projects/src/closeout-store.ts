import type { Id } from '@aura/shared';
import type { ProjectCloseout } from './domain/closeout';

export const CLOSEOUT_STORE = Symbol('CLOSEOUT_STORE');

export interface CloseoutFilter {
  tenantId?: string;
  projectId?: string;
  status?: string;
  limit?: number;
}

export interface CloseoutStore {
  create(c: ProjectCloseout): Promise<void>;
  update(c: ProjectCloseout): Promise<void>;
  get(id: Id): Promise<ProjectCloseout | null>;
  getByProject(tenantId: Id, projectId: Id): Promise<ProjectCloseout | null>;
  list(filter?: CloseoutFilter): Promise<ProjectCloseout[]>;
}
