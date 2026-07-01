import type { Id, Page, PageParams } from '@aura/shared';
import type { VariationOrder } from './domain/variation';

export const VARIATION_STORE = Symbol('VARIATION_STORE');

export interface VariationFilter {
  tenantId?: string;
  projectId?: string;
  status?: string;
  limit?: number;
}

export interface VariationStore {
  create(v: VariationOrder): Promise<void>;
  update(v: VariationOrder): Promise<void>;
  get(id: Id): Promise<VariationOrder | null>;
  list(filter?: VariationFilter): Promise<VariationOrder[]>;
  listPaged(filter: VariationFilter, page: PageParams): Promise<Page<VariationOrder>>;
}
