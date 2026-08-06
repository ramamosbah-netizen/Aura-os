import type { Id } from '@aura/shared';
import type { RetentionRelease } from './domain/retention-release';

/** DI token for the retention-release store. */
export const RETENTION_RELEASE_STORE = Symbol('RETENTION_RELEASE_STORE');

export interface RetentionReleaseFilter {
  tenantId?: string;
  contractId?: string;
  status?: string;
  limit?: number;
}

export interface RetentionReleaseStore {
  save(release: RetentionRelease): Promise<void>;
  get(id: Id): Promise<RetentionRelease | null>;
  list(filter?: RetentionReleaseFilter): Promise<RetentionRelease[]>;
}
