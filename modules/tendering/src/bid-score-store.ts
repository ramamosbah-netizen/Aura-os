import type { Id, Page, PageParams } from '@aura/shared';
import type { BidScore } from './domain/bid-score';

/** DI token for the tender bid-score store. */
export const BID_SCORE_STORE = Symbol('BID_SCORE_STORE');

export class BidScoreLockedError extends Error {
  constructor() { super('The qualification decision is already confirmed and cannot be changed.'); }
}

export interface BidScoreFilter {
  tenantId?: string;
  tenderId?: string;
  recommendation?: string;
  limit?: number;
}

export interface BidScoreStore {
  /** Insert the first confirmed decision atomically; reject replacements, including same-id writes. */
  save(score: BidScore): Promise<void>;
  /** Atomically supersede one locked decision and insert its immutable replacement. */
  amend(previousId: Id, replacement: BidScore, actorId: Id): Promise<void>;
  get(id: Id): Promise<BidScore | null>;
  list(filter?: BidScoreFilter): Promise<BidScore[]>;
  listPaged(filter: BidScoreFilter, page: PageParams): Promise<Page<BidScore>>;
}
