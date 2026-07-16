import type { Id } from '@aura/shared';
import type { InstalledBaseItem } from './domain/installed-base';

/** DI token for the CRM installed-base store. */
export const CRM_INSTALLED_BASE_STORE = Symbol('CRM_INSTALLED_BASE_STORE');

/** Persistence for the account installed base (what the customer HAS, and whose it is). */
export interface InstalledBaseStore {
  create(item: InstalledBaseItem): Promise<void>;
  update(item: InstalledBaseItem): Promise<void>;
  get(id: Id): Promise<InstalledBaseItem | null>;
  delete(id: Id): Promise<void>;
  listFor(tenantId: Id, accountId: Id): Promise<InstalledBaseItem[]>;
}
