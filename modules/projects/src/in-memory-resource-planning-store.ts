import type { Id } from '@aura/shared';
import { sameResource, type ResourceRef } from './domain/resource-ref';
import type { ResourceCapacity, ResourcePool } from './domain/resource-pool';
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
