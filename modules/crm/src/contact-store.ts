import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Contact } from './domain/contact';

/** DI token for the CRM contact store. */
export const CRM_CONTACT_STORE = Symbol('CRM_CONTACT_STORE');

export interface ContactFilter {
  tenantId?: string;
  accountId?: string;
  status?: string;
  /** Case-insensitive search across person and account snapshot fields. */
  search?: string;
  stakeholderRole?: string;
  relationshipStrength?: string;
  limit?: number;
}

/** Aggregates for the filtered contact directory, independent of the current page. */
export interface ContactSummary {
  total: number;
  active: number;
  linked: number;
  primaries: number;
  recent: number;
  decisionMakers: number;
  champions: number;
  unmapped: number;
}

/** Persistence for CRM contacts. Postgres in production; in-memory stand-in for no-DB boots. */
export interface ContactStore {
  save(contact: Contact): Promise<void>;
  /** Save on a caller-owned transaction (atomic with its event); null tx falls back to save. */
  saveWithClient(tx: TxHandle | null, contact: Contact): Promise<void>;
  get(id: Id): Promise<Contact | null>;
  getForTenant(tenantId: string, id: Id): Promise<Contact | null>;
  list(filter?: ContactFilter): Promise<Contact[]>;
  /** Full filtered register for controlled exports; unlike list(), never applies the UI preview limit. */
  listAll(filter: ContactFilter): Promise<Contact[]>;
  /** Stream the full filtered register in bounded batches for large exports. */
  streamAll(filter: ContactFilter, onBatch: (rows: Contact[]) => Promise<void>): Promise<void>;
  listPaged(filter: ContactFilter, page: PageParams): Promise<Page<Contact>>;
  summary(filter: ContactFilter): Promise<ContactSummary>;
}
