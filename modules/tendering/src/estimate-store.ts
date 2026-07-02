import type { Id } from '@aura/shared';
import type { RateBuildUp } from './domain/estimate';

/** DI token for the tender rate-build-up (estimate) store. */
export const ESTIMATE_STORE = Symbol('ESTIMATE_STORE');

export interface EstimateStore {
  save(buildUp: RateBuildUp): Promise<void>;
  get(id: Id): Promise<RateBuildUp | null>;
  /** One build-up per BOQ item. */
  getByBoqItem(tenantId: string, boqItemId: Id): Promise<RateBuildUp | null>;
  listByTender(tenantId: string, tenderId: Id): Promise<RateBuildUp[]>;
  delete(id: Id): Promise<void>;
}
