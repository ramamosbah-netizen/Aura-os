import type { Id, Page, PageParams } from '@aura/shared';
import type { CreditNote, CreditNoteStatus } from './domain/credit-note';

export const CREDIT_NOTE_STORE = Symbol('CREDIT_NOTE_STORE');

export interface CreditNoteFilter {
  tenantId?: string;
  status?: CreditNoteStatus;
  customerInvoiceId?: string;
  limit?: number;
}

export interface CreditNoteStore {
  save(note: CreditNote): Promise<void>;
  get(id: Id): Promise<CreditNote | null>;
  list(filter?: CreditNoteFilter): Promise<CreditNote[]>;
  listPaged(filter: CreditNoteFilter, page: PageParams): Promise<Page<CreditNote>>;
  /** True when a credit note already carries this number for the tenant (per-tenant uniqueness). */
  existsByNumber(tenantId: Id, creditNoteNumber: string): Promise<boolean>;
}
