import type { Id } from '@aura/shared';
import { sameResource, type ResourceRef } from './domain/resource-ref';
import type { ResourceCapacity, ResourcePool, ResourcePoolMember } from './domain/resource-pool';
import type { ResourceConflictResolution } from './domain/resource-conflict-resolution';
import { bookingIsHeld, type ResourceBooking } from './domain/resource-booking';
import type { ResourcePlanningStore } from './resource-planning-store';
import type { ResourceBookingStore } from './resource-booking-store';
import type { ResourceFactsStore, ResourceInterval } from './resource-facts-store';

/** One shared no-database authority for pools, capacity, commitments and conflict reads. */
export class InMemoryResourcePlanningStore implements ResourcePlanningStore, ResourceBookingStore, ResourceFactsStore {
  constructor(
    private readonly pools: ResourcePool[] = [],
    private readonly capacity: ResourceCapacity[] = [],
    private readonly bookings: ResourceBooking[] = [],
    private readonly members: ResourcePoolMember[] = [],
    private readonly conflicts: ResourceConflictResolution[] = [],
  ) {}

  async createConflictResolution(entry: ResourceConflictResolution): Promise<void> {
    // Mirrors the partial unique index of migration 0321: one open ownership per resource, so
    // "who is dealing with this?" never has two answers.
    const open = this.conflicts.some((row) =>
      row.tenantId === entry.tenantId && row.status === 'owned' && sameResource(row.resource, entry.resource));
    if (open) throw new Error('this resource already has an open conflict owner');
    this.conflicts.push(entry);
  }

  async updateConflictResolution(entry: ResourceConflictResolution): Promise<void> {
    const index = this.conflicts.findIndex((row) => row.tenantId === entry.tenantId && row.id === entry.id);
    if (index < 0) throw new Error(`conflict resolution ${entry.id} not found`);
    this.conflicts[index] = entry;
  }

  async getConflictResolution(tenantId: Id, id: Id): Promise<ResourceConflictResolution | null> {
    return this.conflicts.find((row) => row.tenantId === tenantId && row.id === id) ?? null;
  }

  async listConflictResolutions(tenantId: Id, refs?: readonly ResourceRef[]): Promise<ResourceConflictResolution[]> {
    return this.conflicts
      .filter((row) => row.tenantId === tenantId && (!refs || refs.some((ref) => sameResource(ref, row.resource))))
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
  }

  async addPoolMember(member: ResourcePoolMember): Promise<void> {
    // Mirrors the partial unique index of migration 0319, so the no-database composition refuses
    // exactly what the database would.
    const active = this.members.some((row) =>
      row.tenantId === member.tenantId && row.poolId === member.poolId
      && row.employeeId === member.employeeId && row.removedAt === null);
    if (active) throw new Error('this person is already a member of this pool');
    this.members.push(member);
  }

  async updatePoolMember(member: ResourcePoolMember): Promise<void> {
    const index = this.members.findIndex((row) => row.tenantId === member.tenantId && row.id === member.id);
    if (index < 0) throw new Error(`pool member ${member.id} not found`);
    this.members[index] = member;
  }

  async getPoolMember(tenantId: Id, id: Id): Promise<ResourcePoolMember | null> {
    return this.members.find((row) => row.tenantId === tenantId && row.id === id) ?? null;
  }

  async listPoolMembers(tenantId: Id, poolId: Id): Promise<ResourcePoolMember[]> {
    return this.members
      .filter((row) => row.tenantId === tenantId && row.poolId === poolId && row.removedAt === null)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  }

  async listPoolsForEmployee(tenantId: Id, employeeId: Id): Promise<ResourcePoolMember[]> {
    return this.members
      .filter((row) => row.tenantId === tenantId && row.employeeId === employeeId && row.removedAt === null)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  }

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

  async create(booking: ResourceBooking): Promise<void> {
    if (booking.requirementId && await this.heldForRequirement(booking.tenantId, booking.projectId, booking.requirementId)) {
      throw new Error('this requirement already has a held booking');
    }
    this.bookings.push(booking);
  }

  async update(booking: ResourceBooking): Promise<void> {
    const index = this.bookings.findIndex((row) => row.tenantId === booking.tenantId && row.id === booking.id);
    if (index < 0) throw new Error(`resource booking ${booking.id} not found`);
    this.bookings[index] = booking;
  }

  async get(tenantId: Id, id: Id): Promise<ResourceBooking | null> {
    return this.bookings.find((row) => row.tenantId === tenantId && row.id === id) ?? null;
  }

  async listForProject(tenantId: Id, projectId: Id): Promise<ResourceBooking[]> {
    return this.bookings.filter((row) => row.tenantId === tenantId && row.projectId === projectId)
      .sort((a, b) => b.committedAt.localeCompare(a.committedAt));
  }

  async heldForRequirement(tenantId: Id, projectId: Id, requirementId: Id): Promise<ResourceBooking | null> {
    return this.bookings.find((row) => row.tenantId === tenantId && row.projectId === projectId && row.requirementId === requirementId && bookingIsHeld(row)) ?? null;
  }

  async heldBookingsFor(tenantId: Id, refs: readonly ResourceRef[], interval: ResourceInterval): Promise<ResourceBooking[]> {
    return this.bookings.filter((row) => row.tenantId === tenantId && bookingIsHeld(row) && refs.some((ref) => sameResource(ref, row.resource)) && overlaps(row, interval));
  }

  async capacityWindowsFor(tenantId: Id, refs: readonly ResourceRef[], interval: ResourceInterval): Promise<ResourceCapacity[]> {
    return this.capacity.filter((row) => row.tenantId === tenantId && refs.some((ref) => sameResource(ref, row.resource)) && overlaps(row, interval));
  }
}

const overlaps = (row: { from: string; to: string }, interval: ResourceInterval): boolean =>
  interval.to >= interval.from && row.from <= interval.to && row.to >= interval.from;
