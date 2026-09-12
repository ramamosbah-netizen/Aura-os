import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { TechnicalQuery } from './domain/technical-query';

export interface TqFilter {
  tenantId?: Id;
  projectId?: Id;
  status?: TechnicalQuery['status'];
  limit?: number;
}

export interface TechnicalQueryStore {
  create(tq: TechnicalQuery): Promise<void>;
  createWithClient(tx: TxHandle | null, tq: TechnicalQuery): Promise<void>;
  update(tq: TechnicalQuery): Promise<void>;
  updateWithClient(tx: TxHandle | null, tq: TechnicalQuery): Promise<void>;
  get(id: Id): Promise<TechnicalQuery | null>;
  /** LISTING, and capped by default. A question about a WHOLE set goes to `listByStatus`. */
  list(filter?: TqFilter): Promise<TechnicalQuery[]>;
  listPaged(filter: TqFilter, page: PageParams): Promise<Page<TechnicalQuery>>;

  /**
   * Every query on the project in one of `statuses`, OLDEST FIRST, with no cap (TC-GATE-19).
   *
   * Bounded by the work that is actually open rather than by a row count, which is the only
   * bound a health signal may rely on: one that shrinks as the answer becomes "nothing wrong".
   */
  listByStatus(tenantId: Id, projectId: Id, statuses: readonly TechnicalQuery['status'][]): Promise<TechnicalQuery[]>;
}

export const TECHNICAL_QUERY_STORE = Symbol('TechnicalQueryStore');
