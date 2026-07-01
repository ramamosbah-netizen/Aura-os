import type { Id, Page, PageParams } from '@aura/shared';
import type { Activity } from './domain/activity';

/** DI token for the CRM activity store. */
export const CRM_ACTIVITY_STORE = Symbol('CRM_ACTIVITY_STORE');

export interface ActivityFilter {
  tenantId?: string;
  relatedType?: string;
  relatedId?: string;
  status?: string;
  type?: string;
  limit?: number;
}

/** Persistence for CRM activities. Postgres in production; in-memory for no-DB boots. */
export interface ActivityStore {
  save(activity: Activity): Promise<void>;
  get(id: Id): Promise<Activity | null>;
  list(filter?: ActivityFilter): Promise<Activity[]>;
  listPaged(filter: ActivityFilter, page: PageParams): Promise<Page<Activity>>;
}
