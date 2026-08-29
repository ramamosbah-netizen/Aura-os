import type { Id, Page, PageParams } from '@aura/shared';
import type { Activity } from './domain/activity';

/** DI token for the CRM activity store. */
export const CRM_ACTIVITY_STORE = Symbol('CRM_ACTIVITY_STORE');

export interface ActivityFilter {
  tenantId?: string;
  /** Server-side personal-work projection; never fetch the tenant stream to filter in a UI. */
  assigneeId?: string;
  createdBy?: string;
  relatedType?: string;
  relatedId?: string;
  status?: string;
  type?: string;
  /** Case-insensitive server-side search across subject, notes, related name and counterparty. */
  search?: string;
  limit?: number;
}

export interface ActivitySummary {
  total: number;
  open: number;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  completed30: number;
  unassigned: number;
}

/** Persistence for CRM activities. Postgres in production; in-memory for no-DB boots. */
export interface ActivityStore {
  save(activity: Activity): Promise<void>;
  get(id: Id): Promise<Activity | null>;
  list(filter?: ActivityFilter): Promise<Activity[]>;
  listPaged(filter: ActivityFilter, page: PageParams): Promise<Page<Activity>>;
  summary(filter?: ActivityFilter, now?: Date): Promise<ActivitySummary>;
  listAll(filter?: ActivityFilter): Promise<Activity[]>;
}
