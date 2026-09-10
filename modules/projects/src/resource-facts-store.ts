import type { Id } from '@aura/shared';
import type { ResourceRef } from './domain/resource-ref';
import type { ResourceCapacity } from './domain/resource-pool';
import type { ResourceBooking } from './domain/resource-booking';

/**
 * §22 Step 7 — the impure half of the cross-project capacity engine.
 *
 * The pure engine (`domain/resource-facts.ts`) does the arithmetic on facts handed to it as data.
 * This port is where those facts are FETCHED, and it is the one place in §22 that reads ACROSS
 * projects: the whole point is to see the booking another project holds on the same crane. It is
 * deliberately narrow — two reads, no writes, no verdict — so the arithmetic stays testable and
 * this stays the only thing that needs a database.
 *
 * TENANT, NOT PROJECT, is the scope. A caller passes no `projectId`: cross-project visibility is the
 * feature, and a store that filtered by the asking project would recreate the exact blindness §22
 * exists to remove. Tenant isolation is still absolute — enforced by RLS below the store, as
 * everywhere else in §22 — so "across every project" always means "within this tenant".
 *
 * The Postgres implementation and its database proof (two projects, one crane, the same Tuesday,
 * the conflict visible on both) are the deferred part of Step 7; the in-memory implementation
 * satisfies this contract for tests and for a no-database dev boot.
 */

export const RESOURCE_FACTS_STORE = Symbol('RESOURCE_FACTS_STORE');

/** An inclusive date interval (YYYY-MM-DD). */
export interface ResourceInterval {
  from: string;
  to: string;
}

export interface ResourceFactsStore {
  /**
   * Every HELD booking for any of `refs`, held by ANY project in the tenant, whose date range
   * overlaps `interval`. Released bookings are excluded — they hold nothing, so they can conflict
   * with nothing. Identity is typed: a ref matches a booking only when type and id both match.
   */
  heldBookingsFor(
    tenantId: Id,
    refs: readonly ResourceRef[],
    interval: ResourceInterval,
  ): Promise<ResourceBooking[]>;

  /** Every capacity window for any of `refs` whose date range overlaps `interval`. */
  capacityWindowsFor(
    tenantId: Id,
    refs: readonly ResourceRef[],
    interval: ResourceInterval,
  ): Promise<ResourceCapacity[]>;
}
