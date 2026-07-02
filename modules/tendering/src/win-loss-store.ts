import type { Id, Page, PageParams } from '@aura/shared';
import type { TenderOutcome } from './domain/win-loss';

/** DI token for the tender win/loss outcome store. */
export const TENDER_OUTCOME_STORE = Symbol('TENDER_OUTCOME_STORE');

export interface TenderOutcomeFilter {
  tenantId?: string;
  tenderId?: string;
  result?: string;
  limit?: number;
}

export interface TenderOutcomeStore {
  save(outcome: TenderOutcome): Promise<void>;
  get(id: Id): Promise<TenderOutcome | null>;
  list(filter?: TenderOutcomeFilter): Promise<TenderOutcome[]>;
  listPaged(filter: TenderOutcomeFilter, page: PageParams): Promise<Page<TenderOutcome>>;
}
