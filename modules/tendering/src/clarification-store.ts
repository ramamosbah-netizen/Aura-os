import type { Id, Page, PageParams } from '@aura/shared';
import type { TenderClarification } from './domain/clarification';

/** DI token for the tender clarification/addendum store. */
export const CLARIFICATION_STORE = Symbol('CLARIFICATION_STORE');

export interface ClarificationFilter {
  tenantId?: string;
  tenderId?: string;
  kind?: string;
  /** true → only unanswered/unacknowledged records. */
  open?: boolean;
  limit?: number;
}

export interface ClarificationStore {
  save(clarification: TenderClarification): Promise<void>;
  get(id: Id): Promise<TenderClarification | null>;
  list(filter?: ClarificationFilter): Promise<TenderClarification[]>;
  listPaged(filter: ClarificationFilter, page: PageParams): Promise<Page<TenderClarification>>;
}
