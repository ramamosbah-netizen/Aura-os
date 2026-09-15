import type { Id } from '@aura/shared';
import type { ResourceBooking } from './domain/resource-booking';
import type { ResourceBookingStore } from './resource-booking-store';

export class InMemoryResourceBookingStore implements ResourceBookingStore {
  constructor(private readonly rows: ResourceBooking[] = []) {}

  async create(booking: ResourceBooking): Promise<void> {
    if (booking.requirementId && await this.heldForRequirement(booking.tenantId, booking.projectId, booking.requirementId)) {
      throw new Error('this requirement already has a held booking');
    }
    this.rows.push(booking);
  }

  async update(booking: ResourceBooking): Promise<void> {
    const index = this.rows.findIndex((row) => row.tenantId === booking.tenantId && row.id === booking.id);
    if (index < 0) throw new Error(`resource booking ${booking.id} not found`);
    this.rows[index] = booking;
  }

  async get(tenantId: Id, id: Id): Promise<ResourceBooking | null> {
    return this.rows.find((row) => row.tenantId === tenantId && row.id === id) ?? null;
  }

  async listForProject(tenantId: Id, projectId: Id): Promise<ResourceBooking[]> {
    return this.rows.filter((row) => row.tenantId === tenantId && row.projectId === projectId)
      .sort((a, b) => b.committedAt.localeCompare(a.committedAt));
  }

  async heldForRequirement(tenantId: Id, projectId: Id, requirementId: Id): Promise<ResourceBooking | null> {
    return this.rows.find((row) => row.tenantId === tenantId && row.projectId === projectId && row.requirementId === requirementId && row.status === 'held') ?? null;
  }
}
