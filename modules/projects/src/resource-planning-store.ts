import type { Id } from '@aura/shared';
import type { ResourceRef } from './domain/resource-ref';
import type { ResourceCapacity, ResourcePool, ResourcePoolMember } from './domain/resource-pool';

/** Organization-owned resource pools and capacity facts. Project bookings live in a separate port. */
export const RESOURCE_PLANNING_STORE = Symbol('RESOURCE_PLANNING_STORE');

export interface ResourcePlanningStore {
  createPool(pool: ResourcePool): Promise<void>;
  getPool(tenantId: Id, id: Id): Promise<ResourcePool | null>;
  listPools(tenantId: Id): Promise<ResourcePool[]>;
  createCapacity(capacity: ResourceCapacity): Promise<void>;
  listCapacity(tenantId: Id, resource?: ResourceRef): Promise<ResourceCapacity[]>;

  /** Add a person to a pool. Rejects a second ACTIVE membership for the same person. */
  addPoolMember(member: ResourcePoolMember): Promise<void>;
  /** Replace a membership row — the write behind taking somebody off a crew. */
  updatePoolMember(member: ResourcePoolMember): Promise<void>;
  getPoolMember(tenantId: Id, id: Id): Promise<ResourcePoolMember | null>;
  /** Current roster of one pool. Removed members are history, not members. */
  listPoolMembers(tenantId: Id, poolId: Id): Promise<ResourcePoolMember[]>;
  /**
   * The pools this person currently belongs to.
   *
   * The read behind "which crew commitments concern me?", and the reason membership is indexed by
   * employee as well as by pool.
   */
  listPoolsForEmployee(tenantId: Id, employeeId: Id): Promise<ResourcePoolMember[]>;
}
