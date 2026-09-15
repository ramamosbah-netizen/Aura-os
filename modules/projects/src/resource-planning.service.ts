import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Id } from '@aura/shared';
import {
  makeResourceCapacity, makeResourcePool, makeResourcePoolMember, removeResourcePoolMember,
  type NewResourceCapacity, type NewResourcePool, type ResourceCapacity, type ResourcePool, type ResourcePoolMember,
} from './domain/resource-pool';
import type { ResourceRef } from './domain/resource-ref';
import {
  decideConflict, takeConflictOwnership,
  type ConflictResolutionStatus, type ResourceConflictResolution,
} from './domain/resource-conflict-resolution';
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

  // ── Conflict ownership (migration 0321) ──────────────────────────────────
  //
  // The conflict itself is never written here and never stops being derived. What these record is
  // who took it on and what they decided — see domain/resource-conflict-resolution.ts.

  listConflictResolutions(tenantId: Id, refs?: readonly ResourceRef[]): Promise<ResourceConflictResolution[]> {
    return this.store.listConflictResolutions(tenantId, refs);
  }

  /**
   * Put a named person on a resource's conflicts for a period.
   *
   * Nothing checks that a conflict currently EXISTS, deliberately. A planner who can see a clash
   * coming should be able to put somebody on it before it lands, and a conflict that clears while
   * somebody owns it leaves a decision worth reading rather than an error.
   */
  async takeConflictOwnership(input: {
    tenantId: Id; resource: ResourceRef; from: string; to: string; ownerId: Id; assignedBy?: Id | null;
  }): Promise<ResourceConflictResolution> {
    let entry: ResourceConflictResolution;
    try {
      entry = takeConflictOwnership(input);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'this conflict ownership is invalid');
    }
    try {
      await this.store.createConflictResolution(entry);
    } catch (error) {
      if ((error as { code?: string }).code === '23505' || /already has an open conflict owner/.test(String(error))) {
        throw new ConflictException('this resource already has an open conflict owner; record their decision first');
      }
      throw error;
    }
    return entry;
  }

  /** Close it with what was actually done. The conflict clears when the facts do, not here. */
  async decideConflict(input: {
    tenantId: Id; id: Id; status: Exclude<ConflictResolutionStatus, 'owned'>; decision: string; actorId?: Id | null;
  }): Promise<ResourceConflictResolution> {
    const entry = await this.store.getConflictResolution(input.tenantId, input.id);
    if (!entry) throw new NotFoundException('conflict ownership not found');
    let decided: ResourceConflictResolution;
    try {
      decided = decideConflict(entry, { status: input.status, decision: input.decision, actorId: input.actorId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'this decision is invalid';
      throw /already been decided/.test(message) ? new ConflictException(message) : new BadRequestException(message);
    }
    await this.store.updateConflictResolution(decided);
    return decided;
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
