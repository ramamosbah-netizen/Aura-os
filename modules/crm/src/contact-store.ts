import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Contact } from './domain/contact';

/** DI token for the CRM contact store. */
export const CRM_CONTACT_STORE = Symbol('CRM_CONTACT_STORE');

export interface ContactFilter {
  tenantId?: string;
  accountId?: string;
  status?: string;
  limit?: number;
}

/** Persistence for CRM contacts. Postgres in production; in-memory stand-in for no-DB boots. */
export interface ContactStore {
  save(contact: Contact): Promise<void>;
  /** Save on a caller-owned transaction (atomic with its event); null tx falls back to save. */
  saveWithClient(tx: TxHandle | null, contact: Contact): Promise<void>;
  get(id: Id): Promise<Contact | null>;
  list(filter?: ContactFilter): Promise<Contact[]>;
  listPaged(filter: ContactFilter, page: PageParams): Promise<Page<Contact>>;
}
