import type { Id } from '@aura/shared';
import { type ResourceRef, sameResource } from './domain/resource-ref';
import type { ResourceCapacity } from './domain/resource-pool';
import { type ResourceBooking, bookingIsHeld } from './domain/resource-booking';
import type { ResourceFactsStore, ResourceInterval } from './resource-facts-store';

/**
 * In-memory {@link ResourceFactsStore} — the no-database implementation.
 *
 * Holds bookings and capacity windows in plain arrays and applies exactly the filters the port
 * promises: typed reference match, tenant scope, HELD-only bookings, and date-range overlap. It is
 * what the resolver runs against in tests and in a dev boot with no Postgres, and it is the second
 * reading of the contract that keeps the eventual Postgres query honest.
 */
export class InMemoryResourceFactsStore implements ResourceFactsStore {
  constructor(
    private bookings: ResourceBooking[] = [],
    private windows: ResourceCapacity[] = [],
  ) {}

  addBooking(b: ResourceBooking): void {
    this.bookings.push(b);
  }

  addCapacity(c: ResourceCapacity): void {
    this.windows.push(c);
  }

  async heldBookingsFor(
    tenantId: Id,
    refs: readonly ResourceRef[],
    interval: ResourceInterval,
  ): Promise<ResourceBooking[]> {
    return this.bookings.filter(
      (b) =>
        b.tenantId === tenantId &&
        bookingIsHeld(b) &&
        matchesAny(b.resource, refs) &&
        overlaps(b, interval),
    );
  }

  async capacityWindowsFor(
    tenantId: Id,
    refs: readonly ResourceRef[],
    interval: ResourceInterval,
  ): Promise<ResourceCapacity[]> {
    return this.windows.filter(
      (w) =>
        w.tenantId === tenantId &&
        matchesAny(w.resource, refs) &&
        overlaps(w, interval),
    );
  }
}

const matchesAny = (resource: ResourceRef, refs: readonly ResourceRef[]): boolean =>
  refs.some((r) => sameResource(r, resource));

/** Two inclusive ranges overlap when neither ends before the other begins — and an inverted
 * interval (to < from) covers nothing, so it matches nothing. */
const overlaps = (row: { from: string; to: string }, interval: ResourceInterval): boolean =>
  interval.to >= interval.from && row.from <= interval.to && row.to >= interval.from;
