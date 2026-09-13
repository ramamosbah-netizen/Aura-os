import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Project } from './domain/project';

/** DI token for the project store. */
export const PROJECT_STORE = Symbol('PROJECT_STORE');

export interface ProjectFilter {
  tenantId?: string;
  status?: string;
  accountId?: string;
  contractId?: string;
  limit?: number;
  /**
   * Restrict to these project ids.
   *
   * Exists so governed discovery can hand the AUTHORISED set to the query itself: the count, the
   * search and the page window are then computed over what the caller may see, not over the
   * tenant with the rest removed afterwards. An EMPTY array means exactly that — no projects —
   * and must not be read as "no filter", which is the mistake that would return everything to
   * someone entitled to nothing.
   */
  ids?: string[];
  /** Case-insensitive match on title or code. Applied inside the same query as `ids`. */
  search?: string;
}

export interface ProjectStore {
  create(project: Project): Promise<void>;
  /** Insert on a caller-owned transaction (atomic with its event); null tx falls back to create. */
  createWithClient(tx: TxHandle | null, project: Project): Promise<void>;
  update(project: Project): Promise<void>;
  /** Update on a caller-owned transaction (atomic with its event); null tx falls back to update. */
  updateWithClient(tx: TxHandle | null, project: Project): Promise<void>;
  get(id: Id): Promise<Project | null>;
  list(filter?: ProjectFilter): Promise<Project[]>;
  listPaged(filter: ProjectFilter, page: PageParams): Promise<Page<Project>>;
}
