import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Drawing } from './domain/drawing';

export interface DrawingFilter {
  tenantId?: Id;
  projectId?: Id;
  status?: Drawing['status'];
  limit?: number;
}

/**
 * How many drawing revisions sit in each (discipline, status) pair on a project (TC-GATE-19).
 *
 * BOUNDED BY THE VOCABULARY, not by a row cap: there are as many rows as there are disciplines
 * times statuses, whatever the size of the project. That is the point — a resolver built on a
 * read that CAN truncate will eventually be wrong, and no caller can pass a limit to this one.
 */
export interface DrawingReleaseCount {
  discipline: string;
  status: Drawing['status'];
  count: number;
}

export interface DrawingStore {
  create(drawing: Drawing): Promise<void>;
  createWithClient(tx: TxHandle | null, drawing: Drawing): Promise<void>;
  update(drawing: Drawing): Promise<void>;
  updateWithClient(tx: TxHandle | null, drawing: Drawing): Promise<void>;
  get(id: Id): Promise<Drawing | null>;
  getByCode(tenantId: Id, projectId: Id, code: string, revision: string): Promise<Drawing | null>;
  getLatestByCode(tenantId: Id, projectId: Id, code: string): Promise<Drawing | null>;
  /** Full revision lineage for a logical drawing (all revisions of one code), newest first. */
  listRevisions(tenantId: Id, projectId: Id, code: string): Promise<Drawing[]>;
  /**
   * LISTING. Applies a default cap, so it answers "show me some drawings" and never "how many
   * are there" — see the two reads below, which exist because a question about a WHOLE set may
   * not be answered from a capped list.
   */
  list(filter?: DrawingFilter): Promise<Drawing[]>;
  listPaged(filter: DrawingFilter, page: PageParams): Promise<Page<Drawing>>;

  /** Release state across the whole project. No limit, and no parameter that could add one. */
  summariseRelease(tenantId: Id, projectId: Id): Promise<DrawingReleaseCount[]>;

  /**
   * Every revision on the project in one of `statuses`, OLDEST FIRST.
   *
   * Oldest first because the caller reports the worst case and shows the first few: the longest
   * outstanding review is the one a reader needs named, and it is the last thing a newest-first
   * cap would have kept.
   */
  listByStatus(tenantId: Id, projectId: Id, statuses: readonly Drawing['status'][]): Promise<Drawing[]>;
}

export const DRAWING_STORE = Symbol('DrawingStore');
