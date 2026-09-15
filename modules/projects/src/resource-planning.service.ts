import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Id } from '@aura/shared';
import {
  makeResourceCapacity, makeResourcePool, makeResourcePoolMember, removeResourcePoolMember,
  type NewResourceCapacity, type NewResourcePool, type ResourceCapacity, type ResourcePool, type ResourcePoolMember,
} from './domain/resource-pool';
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

  // ── Membership: who is in the pool (migration 0319) ──────────────────────
  //
  // Separate from capacity on purpose. `listCapacity` answers how much is available; these answer
  // who belongs. Nothing here derives one from the other — see domain/resource-pool.ts.

  listPoolMembers(tenantId: Id, poolId: Id): Promise<ResourcePoolMember[]> {
    return this.store.listPoolMembers(tenantId, poolId);
  }

  /** The pools this person is currently in — the read behind "which crew commitments concern me?". */
  listPoolsForEmployee(tenantId: Id, employeeId: Id): Promise<ResourcePoolMember[]> {
    return this.store.listPoolsForEmployee(tenantId, employeeId);
  }

  /**
   * Put a named person on a crew.
   *
   * The pool is reloaded rather than trusted from the request: a membership pointing at a pool in
   * another tenant would put someone on a crew they cannot be seen to be on. That the employee id
   * is a real employee is the app layer's check, against HR's own catalogue — Projects references
   * HR, it does not import it (ADR-0004).
   */
  async addPoolMember(input: { tenantId: Id; poolId: Id; employeeId: Id; addedBy?: Id | null }): Promise<ResourcePoolMember> {
    const pool = await this.store.getPool(input.tenantId, input.poolId);
    if (!pool) throw new NotFoundException('resource pool not found in this tenant');
    const member = makeResourcePoolMember(input);
    try {
      await this.store.addPoolMember(member);
    } catch (error) {
      if ((error as { code?: string }).code === '23505' || /already a member/.test(String(error))) {
        throw new ConflictException('this person is already a member of this pool');
      }
      throw error;
    }
    return member;
  }

  /** Take somebody off the crew. The record stays; only their current membership ends. */
  async removePoolMember(input: { tenantId: Id; poolId: Id; memberId: Id; removedBy?: Id | null }): Promise<ResourcePoolMember> {
    const member = await this.store.getPoolMember(input.tenantId, input.memberId);
    if (!member || member.poolId !== input.poolId) {
      throw new NotFoundException('pool member not found in this pool');
    }
    let removed: ResourcePoolMember;
    try {
      removed = removeResourcePoolMember(member, input.removedBy ?? null);
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : 'this membership cannot be removed');
    }
    await this.store.updatePoolMember(removed);
    return removed;
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
