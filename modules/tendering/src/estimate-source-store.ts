import type { Id } from '@aura/shared';
import type { EstimateSource } from './domain/estimate-source';

/** DI token for the bid-time estimate-source (build-up component ↔ RFQ quote) store. */
export const ESTIMATE_SOURCE_STORE = Symbol('ESTIMATE_SOURCE_STORE');

export interface EstimateSourceStore {
  /** Insert or replace the source for a component (unique per buildUpId+componentId). */
  upsert(source: EstimateSource): Promise<void>;
  getByComponent(tenantId: Id, buildUpId: Id, componentId: Id): Promise<EstimateSource | null>;
  listByTender(tenantId: Id, tenderId: Id): Promise<EstimateSource[]>;
  listByBuildUp(tenantId: Id, buildUpId: Id): Promise<EstimateSource[]>;
  /** All components sourced from a given RFQ — the award reactor's lookup. */
  listByRfq(tenantId: Id, rfqId: Id): Promise<EstimateSource[]>;
  remove(tenantId: Id, buildUpId: Id, componentId: Id): Promise<void>;
  /** Drop every source for a build-up — called when the build-up is rebuilt/deleted. */
  removeByBuildUp(tenantId: Id, buildUpId: Id): Promise<void>;
}
