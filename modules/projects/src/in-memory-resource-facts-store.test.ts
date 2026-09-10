import { describe, it, expect } from 'vitest';
import type { ResourceRef } from './domain/resource-ref';
import { makeResourceCapacity } from './domain/resource-pool';
import { commitBooking, releaseBooking } from './domain/resource-booking';
import { assessResourceAcrossProjects } from './domain/resource-facts';
import { InMemoryResourceFactsStore } from './in-memory-resource-facts-store';

/**
 * The in-memory {@link ResourceFactsStore} is the second reading of the port contract, and the seam
 * the resolver pipeline runs against with no database. These tests pin the filters the eventual
 * Postgres query must match exactly: tenant scope, HELD-only, typed reference match, interval overlap
 * — and then run the whole cross-project pipeline (store → assessResourceAcrossProjects) end to end.
 */

const TENANT = 's22-step7-store';
const OTHER_TENANT = 's22-step7-other';
const CRANE: ResourceRef = { resourceType: 'asset', canonicalResourceId: 'cccccccc-0000-4000-8000-00000000c1a5' };
const PROJECT_A = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const PROJECT_B = 'bbbbbbbb-0000-4000-8000-0000000000b2';
const TUE = '2026-03-10';

const crane = (over = {}) =>
  commitBooking({ tenantId: TENANT, projectId: PROJECT_A, resource: CRANE, unit: 'units', quantity: 1, from: TUE, to: TUE, ...over });

const capacity = (over = {}) =>
  makeResourceCapacity({ tenantId: TENANT, resource: CRANE, unit: 'units', quantity: 1, from: '2026-03-01', to: '2026-03-31', ...over });

describe('InMemoryResourceFactsStore', () => {
  it('returns held bookings across projects, and excludes other tenants and released bookings', async () => {
    const store = new InMemoryResourceFactsStore();
    store.addBooking(crane({ projectId: PROJECT_A }));
    store.addBooking(crane({ projectId: PROJECT_B }));
    store.addBooking(releaseBooking(crane({ projectId: PROJECT_A }), { reason: 'returned' }));
    store.addBooking(crane({ tenantId: OTHER_TENANT, projectId: PROJECT_B }));

    const held = await store.heldBookingsFor(TENANT, [CRANE], { from: TUE, to: TUE });
    expect(held).toHaveLength(2);
    expect(held.map((b) => b.projectId).sort()).toEqual([PROJECT_A, PROJECT_B].sort());
    expect(held.every((b) => b.tenantId === TENANT && b.status === 'held')).toBe(true);
  });

  it('matches references by TYPE and id, not bare id', async () => {
    const store = new InMemoryResourceFactsStore();
    store.addBooking(crane()); // an ASSET
    const asVehicle: ResourceRef = { resourceType: 'vehicle', canonicalResourceId: CRANE.canonicalResourceId };
    expect(await store.heldBookingsFor(TENANT, [asVehicle], { from: TUE, to: TUE })).toHaveLength(0);
    expect(await store.heldBookingsFor(TENANT, [CRANE], { from: TUE, to: TUE })).toHaveLength(1);
  });

  it('returns only rows whose range overlaps the interval', async () => {
    const store = new InMemoryResourceFactsStore();
    store.addBooking(crane({ from: '2026-03-01', to: '2026-03-02' })); // before
    store.addBooking(crane({ from: TUE, to: TUE }));                    // inside
    store.addCapacity(capacity({ from: '2026-03-01', to: '2026-03-31' }));

    expect(await store.heldBookingsFor(TENANT, [CRANE], { from: TUE, to: TUE })).toHaveLength(1);
    expect(await store.capacityWindowsFor(TENANT, [CRANE], { from: TUE, to: TUE })).toHaveLength(1);
  });

  it('feeds the cross-project engine end to end — two projects, one crane, one conflict', async () => {
    const store = new InMemoryResourceFactsStore();
    store.addCapacity(capacity({ quantity: 1 }));
    store.addBooking(crane({ projectId: PROJECT_A }));
    store.addBooking(crane({ projectId: PROJECT_B }));

    const interval = { from: TUE, to: TUE };
    const [windows, bookings] = await Promise.all([
      store.capacityWindowsFor(TENANT, [CRANE], interval),
      store.heldBookingsFor(TENANT, [CRANE], interval),
    ]);
    const report = assessResourceAcrossProjects(CRANE, windows, bookings, interval);

    expect(report.feasibility).toBe('CONFLICTED');
    expect(report.projectsInvolved).toEqual([PROJECT_A, PROJECT_B].sort());
  });
});
