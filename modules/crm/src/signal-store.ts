import type { Id, Page, PageParams, Signal, SignalStatus, SignalType } from '@aura/shared';
import type { TxHandle } from '@aura/core';

export const CRM_SIGNAL_STORE = Symbol('CRM_SIGNAL_STORE');

export interface SignalFilter {
  tenantId?: string;
  status?: SignalStatus;
  statuses?: SignalStatus[];
  source?: string;
  type?: SignalType;
  ownerId?: string;
  accountId?: string;
  contextType?: string;
  contextId?: string;
  search?: string;
  detectedFrom?: string;
  detectedTo?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  sort?: 'detectedAt' | 'confidence' | 'title';
  direction?: 'asc' | 'desc';
  dedupeKey?: string;
  limit?: number;
}

export interface SignalSummary {
  total: number;
  open: number;
  new: number;
  reviewing: number;
  researching: number;
  promoted: number;
  dismissed: number;
  highPotential: number;
  bySource: Array<{ key: string; count: number }>;
  byType: Array<{ key: string; count: number }>;
}

export interface SignalStore {
  create(signal: Signal): Promise<void>;
  createWithClient(tx: TxHandle | null, signal: Signal): Promise<void>;
  update(signal: Signal): Promise<void>;
  updateWithClient(tx: TxHandle | null, signal: Signal): Promise<void>;
  get(id: Id): Promise<Signal | null>;
  /** Lookup constrained by tenant at the persistence boundary (never fetch-then-check). */
  getForTenant(tenantId: string, id: Id): Promise<Signal | null>;
  /** Lock a tenant-scoped signal for the duration of a caller-owned transaction. */
  getForUpdateWithClient(tx: TxHandle | null, tenantId: string, id: Id): Promise<Signal | null>;
  list(filter?: SignalFilter): Promise<Signal[]>;
  listPaged(filter: SignalFilter, page: PageParams): Promise<Page<Signal>>;
  summary?(filter: SignalFilter): Promise<SignalSummary>;
  exportAll?(filter: SignalFilter): Promise<Signal[]>;
}
