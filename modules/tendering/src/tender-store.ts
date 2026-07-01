import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Tender } from './domain/tender';

/** DI token for the tender store. */
export const TENDER_STORE = Symbol('TENDER_STORE');

export interface TenderFilter {
  tenantId?: string;
  status?: string;
  accountId?: string;
  limit?: number;
}

export interface TenderStore {
  create(tender: Tender): Promise<void>;
  /** Insert on a caller-owned transaction (atomic with its event); null tx falls back to create. */
  createWithClient(tx: TxHandle | null, tender: Tender): Promise<void>;
  update(tender: Tender): Promise<void>;
  /** Update on a caller-owned transaction (atomic with its event); null tx falls back to update. */
  updateWithClient(tx: TxHandle | null, tender: Tender): Promise<void>;
  get(id: Id): Promise<Tender | null>;
  list(filter?: TenderFilter): Promise<Tender[]>;
  listPaged(filter: TenderFilter, page: PageParams): Promise<Page<Tender>>;
}

