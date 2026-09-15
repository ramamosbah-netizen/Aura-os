import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Id } from '@aura/shared';
import { makeResourceCapacity, makeResourcePool, type NewResourceCapacity, type NewResourcePool, type ResourceCapacity, type ResourcePool } from './domain/resource-pool';
import type { ResourceRef } from './domain/resource-ref';
import { RESOURCE_PLANNING_STORE, type ResourcePlanningStore } from './resource-planning-store';

@Injectable()
export class ResourcePlanningService {
  constructor(@Inject(RESOURCE_PLANNING_STORE) private readonly store: ResourcePlanningStore) {}

  listPools(tenantId: Id): Promise<ResourcePool[]> {
    return this.store.listPools(tenantId);
  }

  async createPool(input: NewResourcePool): Promise<ResourcePool> {
    const pool = makeResourcePool(input);
    try {
      await this.store.createPool(pool);
    } catch (error) {
      if ((error as { code?: string }).code === '23505' || /already exists/.test(String(error))) {
        throw new ConflictException('a resource pool with this name already exists in the selected organization scope');
      }
      throw error;
    }
    return pool;
  }

  listCapacity(tenantId: Id, resource?: ResourceRef): Promise<ResourceCapacity[]> {
    return this.store.listCapacity(tenantId, resource);
  }

  async createCapacity(input: NewResourceCapacity): Promise<ResourceCapacity> {
    if (input.resource.resourceType === 'pool') {
      const pool = await this.store.getPool(input.tenantId, input.resource.canonicalResourceId);
      if (!pool) throw new NotFoundException('resource pool not found in this tenant');
      if (pool.unit !== input.unit) throw new ConflictException(`this pool is measured in ${pool.unit}, so its capacity must use the same unit`);
    }
    const capacity = makeResourceCapacity(input);
    await this.store.createCapacity(capacity);
    return capacity;
  }
}
