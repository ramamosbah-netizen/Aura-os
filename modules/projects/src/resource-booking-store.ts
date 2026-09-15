import type { Id } from '@aura/shared';
import type { ResourceBooking } from './domain/resource-booking';

/** Project-owned commitment history. Cross-project conflict reads use ResourceFactsStore. */
export const RESOURCE_BOOKING_STORE = Symbol('RESOURCE_BOOKING_STORE');

export interface ResourceBookingStore {
  create(booking: ResourceBooking): Promise<void>;
  update(booking: ResourceBooking): Promise<void>;
  get(tenantId: Id, id: Id): Promise<ResourceBooking | null>;
  listForProject(tenantId: Id, projectId: Id): Promise<ResourceBooking[]>;
  heldForRequirement(tenantId: Id, projectId: Id, requirementId: Id): Promise<ResourceBooking | null>;
}
