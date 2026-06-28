import type { Id } from '@aura/shared';
import type { Journal } from './domain/journal';

export const JOURNAL_STORE = Symbol('JOURNAL_STORE');

export interface JournalFilter {
  tenantId?: string;
  reference?: string;
  limit?: number;
}

export interface JournalStore {
  create(journal: Journal): Promise<void>;
  get(id: Id): Promise<Journal | null>;
  list(filter?: JournalFilter): Promise<Journal[]>;
}
