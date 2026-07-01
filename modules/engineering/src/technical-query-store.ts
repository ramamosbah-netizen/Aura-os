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
  list(filter?: TqFilter): Promise<TechnicalQuery[]>;
  listPaged(filter: TqFilter, page: PageParams): Promise<Page<TechnicalQuery>>;
}

export const TECHNICAL_QUERY_STORE = Symbol('TechnicalQueryStore');
