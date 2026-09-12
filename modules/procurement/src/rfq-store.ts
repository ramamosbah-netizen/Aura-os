import type { Id, Page, PageParams } from '@aura/shared';
import type { Rfq, RfqQuote } from './domain/rfq';

/** DI token for the RFQ store. */
export const RFQ_STORE = Symbol('RFQ_STORE');

export interface RfqFilter {
  tenantId?: string;
  status?: string;
  prId?: string;
  limit?: number;
}

export interface RfqStore {
  create(rfq: Rfq): Promise<void>;
  update(rfq: Rfq): Promise<void>;
  get(id: Id): Promise<Rfq | null>;
  /** LISTING, and capped by default. A question about every RFQ on a project goes below. */
  list(filter?: RfqFilter): Promise<Rfq[]>;
  listPaged(filter: RfqFilter, page: PageParams): Promise<Page<Rfq>>;

  /**
   * Every RFQ raised against any of `prIds`, uncapped (TC-GATE-19).
   *
   * One read for the whole set rather than one per request: an RFQ carries `prId` and never a
   * project, so this is how sourcing work is resolved to a project at all.
   */
  listByPrIds(tenantId: Id, prIds: readonly string[]): Promise<Rfq[]>;
  addQuote(quote: RfqQuote): Promise<void>;
  updateQuote(quote: RfqQuote): Promise<void>;
  getQuote(id: Id): Promise<RfqQuote | null>;
  listQuotes(rfqId: Id): Promise<RfqQuote[]>;
}
