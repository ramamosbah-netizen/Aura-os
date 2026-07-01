import type { Id, Page, PageParams } from '@aura/shared';
import type { BidScore } from './domain/bid-score';

/** DI token for the tender bid-score store. */
export const BID_SCORE_STORE = Symbol('BID_SCORE_STORE');

export interface BidScoreFilter {
  tenantId?: string;
  tenderId?: string;
  recommendation?: string;
  limit?: number;
}

export interface BidScoreStore {
  save(score: BidScore): Promise<void>;
  get(id: Id): Promise<BidScore | null>;
  list(filter?: BidScoreFilter): Promise<BidScore[]>;
  listPaged(filter: BidScoreFilter, page: PageParams): Promise<Page<BidScore>>;
}
