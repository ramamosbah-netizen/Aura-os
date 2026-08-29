import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Quotation, QuotationStatus } from './domain/quotation';

export const CRM_QUOTATION_STORE = Symbol('CRM_QUOTATION_STORE');

export interface QuotationFilter {
  tenantId?: string;
  status?: QuotationStatus;
  accountId?: string;
  /** Case-insensitive search across quote number, customer, subject and contact. */
  search?: string;
  ownerId?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  sourceTenderId?: string;
  /** Quotes raised from one opportunity — the G5 stage gate asks 'is there a proposal yet?'. */
  sourceOpportunityId?: string;
  /** All revisions of one quote share a number — used to fetch the revision chain. */
  quoteNumber?: string;
  limit?: number;
}

/** Tenant-scoped aggregates for the quotation Overview. Unlike a page, these cover every match. */
export interface QuotationSummary {
  total: number;
  totalValue: number;
  draftValue: number;
  openValue: number;
  acceptedValue: number;
  lostValue: number;
  acceptedCount: number;
  decidedCount: number;
  expiringSoon: number;
  pendingApproval: number;
  stage: Record<string, { count: number; value: number }>;
  sources: { opportunity: number; tender: number; direct: number };
}

export interface QuotationStore {
  save(quotation: Quotation): Promise<void>;
  /**
   * Save inside a caller-provided transaction (Slice 8 PR-2). `tx === null` degrades to a plain
   * `save`. Materialising a quotation from a frozen pricing revision writes the superseded prior
   * quote, the new revision, AND the pricing→quote link as ONE unit — this is the quotation half.
   */
  saveWithClient(tx: TxHandle | null, quotation: Quotation): Promise<void>;
  get(id: Id): Promise<Quotation | null>;
  /** Lookup by both identity and tenant; callers use this for sensitive chain roots. */
  getForTenant(tenantId: string, id: Id): Promise<Quotation | null>;
  /** Optional row-locking lookup used by lifecycle mutations inside a transaction. */
  getForTenantForUpdate?(tx: TxHandle, tenantId: string, id: Id): Promise<Quotation | null>;
  list(filter?: QuotationFilter): Promise<Quotation[]>;
  /** Stream the complete filtered register in bounded batches for exports. */
  streamAll(filter: QuotationFilter, onBatch: (rows: Quotation[]) => Promise<void>): Promise<void>;
  listPaged(filter: QuotationFilter, page: PageParams): Promise<Page<Quotation>>;
  summary(filter: QuotationFilter): Promise<QuotationSummary>;
}
