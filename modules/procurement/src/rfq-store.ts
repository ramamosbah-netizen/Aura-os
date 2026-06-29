import type { Id } from '@aura/shared';
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
  list(filter?: RfqFilter): Promise<Rfq[]>;
  addQuote(quote: RfqQuote): Promise<void>;
  updateQuote(quote: RfqQuote): Promise<void>;
  getQuote(id: Id): Promise<RfqQuote | null>;
  listQuotes(rfqId: Id): Promise<RfqQuote[]>;
}
