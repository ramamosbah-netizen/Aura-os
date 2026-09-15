import type { Id } from '@aura/shared';
import { sameResource, type ResourceRef } from './domain/resource-ref';
import type { ResourceCapacity, ResourcePool } from './domain/resource-pool';
import type { ResourcePlanningStore } from './resource-planning-store';

export class InMemoryResourcePlanningStore implements ResourcePlanningStore {
  constructor(
    private readonly pools: ResourcePool[] = [],
    private readonly capacity: ResourceCapacity[] = [],
  ) {}

  async createPool(pool: ResourcePool): Promise<void> {
    if (this.pools.some((item) => item.tenantId === pool.tenantId && item.orgNodeId === pool.orgNodeId && item.name.toLocaleLowerCase() === pool.name.toLocaleLowerCase())) {
      throw new Error('a resource pool with this name already exists in the selected organization scope');
    }
    this.pools.push(pool);
  }

  async getPool(tenantId: Id, id: Id): Promise<ResourcePool | null> {
    return this.pools.find((pool) => pool.tenantId === tenantId && pool.id === id) ?? null;
  }

  async listPools(tenantId: Id): Promise<ResourcePool[]> {
    return this.pools.filter((pool) => pool.tenantId === tenantId).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createCapacity(capacity: ResourceCapacity): Promise<void> {
    this.capacity.push(capacity);
  }

  async listCapacity(tenantId: Id, resource?: ResourceRef): Promise<ResourceCapacity[]> {
    return this.capacity
      .filter((item) => item.tenantId === tenantId && (!resource || sameResource(item.resource, resource)))
      .sort((a, b) => a.from.localeCompare(b.from));
  }
}
