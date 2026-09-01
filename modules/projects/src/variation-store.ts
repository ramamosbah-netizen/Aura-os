import type { Id, Page, PageParams } from '@aura/shared';
import type { VariationOrder, VariationStatus } from './domain/variation';

export const VARIATION_STORE = Symbol('VARIATION_STORE');

export interface VariationFilter {
  tenantId?: string;
  projectId?: string;
  status?: string;
  limit?: number;
}

export interface VariationStore {
  create(v: VariationOrder): Promise<void>;
  /**
   * Persist a status transition. When expectedStatus is provided the write is
   * optimistic/concurrency guarded and returns false if another writer moved
   * the variation first.
   */
  update(v: VariationOrder, expectedStatus?: VariationStatus): Promise<boolean>;
  get(id: Id): Promise<VariationOrder | null>;
  list(filter?: VariationFilter): Promise<VariationOrder[]>;
  listPaged(filter: VariationFilter, page: PageParams): Promise<Page<VariationOrder>>;
}
