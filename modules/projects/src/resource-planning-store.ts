import type { Id } from '@aura/shared';
import type { ResourceRef } from './domain/resource-ref';
import type { ResourceCapacity, ResourcePool } from './domain/resource-pool';

/** Organization-owned resource pools and capacity facts. Project bookings live in a separate port. */
export const RESOURCE_PLANNING_STORE = Symbol('RESOURCE_PLANNING_STORE');

export interface ResourcePlanningStore {
  createPool(pool: ResourcePool): Promise<void>;
  getPool(tenantId: Id, id: Id): Promise<ResourcePool | null>;
  listPools(tenantId: Id): Promise<ResourcePool[]>;
  createCapacity(capacity: ResourceCapacity): Promise<void>;
  listCapacity(tenantId: Id, resource?: ResourceRef): Promise<ResourceCapacity[]>;
}
