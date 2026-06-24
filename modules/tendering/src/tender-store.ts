import type { Id } from '@aura/shared';
import type { Tender } from './domain/tender';

/** DI token for the tender store. */
export const TENDER_STORE = Symbol('TENDER_STORE');

export interface TenderFilter {
  tenantId?: string;
  status?: string;
  accountId?: string;
  limit?: number;
}

export interface TenderStore {
  create(tender: Tender): Promise<void>;
  get(id: Id): Promise<Tender | null>;
  list(filter?: TenderFilter): Promise<Tender[]>;
}
