import type { Id, Page, PageParams, Signal, SignalStatus } from '@aura/shared';
import type { TxHandle } from '@aura/core';

export const CRM_SIGNAL_STORE = Symbol('CRM_SIGNAL_STORE');

export interface SignalFilter {
  tenantId?: string;
  status?: SignalStatus;
  source?: string;
  accountId?: string;
  dedupeKey?: string;
  limit?: number;
}

export interface SignalStore {
  create(signal: Signal): Promise<void>;
  createWithClient(tx: TxHandle | null, signal: Signal): Promise<void>;
  update(signal: Signal): Promise<void>;
  updateWithClient(tx: TxHandle | null, signal: Signal): Promise<void>;
  get(id: Id): Promise<Signal | null>;
  list(filter?: SignalFilter): Promise<Signal[]>;
  listPaged(filter: SignalFilter, page: PageParams): Promise<Page<Signal>>;
}
