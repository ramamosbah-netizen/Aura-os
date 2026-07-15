import type { Id, Page, PageParams } from '@aura/shared';
import type { Quotation, QuotationStatus } from './domain/quotation';

export const CRM_QUOTATION_STORE = Symbol('CRM_QUOTATION_STORE');

export interface QuotationFilter {
  tenantId?: string;
  status?: QuotationStatus;
  accountId?: string;
  sourceTenderId?: string;
  /** Quotes raised from one opportunity — the G5 stage gate asks 'is there a proposal yet?'. */
  sourceOpportunityId?: string;
  /** All revisions of one quote share a number — used to fetch the revision chain. */
  quoteNumber?: string;
  limit?: number;
}

export interface QuotationStore {
  save(quotation: Quotation): Promise<void>;
  get(id: Id): Promise<Quotation | null>;
  list(filter?: QuotationFilter): Promise<Quotation[]>;
  listPaged(filter: QuotationFilter, page: PageParams): Promise<Page<Quotation>>;
}
