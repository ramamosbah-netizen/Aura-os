import { describe, it, expect } from 'vitest';
import type { ResourceRef } from './resource-ref';
import { makeResourceCapacity, type ResourceCapacity } from './resource-pool';
import { assessBooking, commitBooking, releaseBooking, type ResourceBooking } from './resource-booking';
import {
  assessResourceAcrossProjects,
  dayLoadsForBooking,
  externalCommitmentsFor,
  resolveResourceLoad,
} from './resource-facts';

/**
 * §22 Step 7 — the cross-project capacity engine, proven at the unit boundary.
 *
 * The headline is the failure §22 was opened for: two projects, one crane, the same Tuesday, and a
 * conflict that is visible on both. Everything else here is a discipline this engine must not lose —
 * unknown ≠ available ≠ a known zero, units are never summed, identity is typed, released holds
 * nothing. The database proof (the same walk against real PostgreSQL, cross-project and cross-tenant)
 * is the deferred half of Step 7.
 */

const TENANT = 's22-step7';
const CRANE: ResourceRef = { resourceType: 'asset', canonicalResourceId: 'cccccccc-0000-4000-8000-00000000c1a5' };
const PROJECT_A = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const PROJECT_B = 'bbbbbbbb-0000-4000-8000-0000000000b2';
const TUE = '2026-03-10';

const capacity = (over: Partial<Parameters<typeof makeResourceCapacity>[0]> = {}): ResourceCapacity =>
  makeResourceCapacity({
    tenantId: TENANT, resource: CRANE, unit: 'units', quantity: 1, from: '2026-03-01', to: '2026-03-31', ...over,
  });

const booking = (over: Partial<Parameters<typeof commitBooking>[0]> = {}): ResourceBooking =>
  commitBooking({
    tenantId: TENANT, projectId: PROJECT_A, resource: CRANE, unit: 'units', quantity: 1, from: TUE, to: TUE, ...over,
  });

describe('assessResourceAcrossProjects — the crane conflict', () => {
  it('flags one crane booked by two projects on the same day, and names both', () => {
    const a = booking({ projectId: PROJECT_A });
    const b = booking({ projectId: PROJECT_B });

    const report = assessResourceAcrossProjects(CRANE, [capacity()], [a, b], { from: TUE, to: TUE });

    expect(report.feasibility).toBe('CONFLICTED');
    expect(report.conflictDays).toEqual([TUE]);
    expect(report.projectsInvolved).toEqual([PROJECT_A, PROJECT_B].sort());
    const day = report.days[0];
    expect(day.capacity).toBe(1);
    expect(day.committed).toBe(2);
    expect(day.overBy).toBe(1);
    expect(day.contributors.map((c) => c.projectId).sort()).toEqual([PROJECT_A, PROJECT_B].sort());
  });

  it('is visible on BOTH projects — each booking assessed against the cross-project load conflicts', () => {
    const a = booking({ projectId: PROJECT_A });
    const b = booking({ projectId: PROJECT_B });
    const all = [a, b];
    const windows = [capacity()];

    for (const own of all) {
      const loads = dayLoadsForBooking(own, windows, all);
      expect(assessBooking(own, loads).feasibility).toBe('CONFLICTED');
    }
  });

  it('a booking that fitted alone becomes CONFLICTED the moment the other project books', () => {
    const a = booking({ projectId: PROJECT_A });
    const windows = [capacity()];

    // Alone, A fits: committed 1, capacity 1.
    expect(assessBooking(a, dayLoadsForBooking(a, windows, [a])).feasibility).toBe('AVAILABLE');

    // B books the same crane the same day. Nothing about A's record changed; its current feasibility did.
    const b = booking({ projectId: PROJECT_B });
    expect(assessBooking(a, dayLoadsForBooking(a, windows, [a, b])).feasibility).toBe('CONFLICTED');
  });

  it('one project within capacity is AVAILABLE', () => {
    const report = assessResourceAcrossProjects(CRANE, [capacity()], [booking()], { from: TUE, to: TUE });
    expect(report.feasibility).toBe('AVAILABLE');
    expect(report.conflictDays).toEqual([]);
    expect(report.days[0].overBy).toBeNull();
  });
});

describe('assessResourceAcrossProjects — the false confidences it must refuse', () => {
  it('unknown capacity with positive demand is UNKNOWN, never AVAILABLE', () => {
    // No capacity window at all.
    const report = assessResourceAcrossProjects(CRANE, [], [booking()], { from: TUE, to: TUE });
    expect(report.feasibility).toBe('UNKNOWN');
    expect(report.days[0].capacity).toBeNull();
    expect(report.days[0].unknownReason).toBe('NONE_DECLARED');
  });

  it('a known ZERO capacity with demand is CONFLICTED, not UNKNOWN — zero is a fact', () => {
    const report = assessResourceAcrossProjects(CRANE, [capacity({ quantity: 0 })], [booking()], { from: TUE, to: TUE });
    expect(report.feasibility).toBe('CONFLICTED');
    expect(report.days[0].capacity).toBe(0);
    expect(report.days[0].overBy).toBe(1);
  });

  it('unknown capacity with NO demand is AVAILABLE — nothing is at risk', () => {
    const report = assessResourceAcrossProjects(CRANE, [], [], { from: TUE, to: TUE });
    expect(report.feasibility).toBe('AVAILABLE');
    expect(report.days[0].unknownReason).toBeUndefined();
  });

  it('capacity and bookings in different units are UNKNOWN — never summed or converted', () => {
    const personsBooking = booking({ unit: 'persons' });
    const report = assessResourceAcrossProjects(CRANE, [capacity({ unit: 'units' })], [personsBooking], { from: TUE, to: TUE });
    expect(report.feasibility).toBe('UNKNOWN');
    expect(report.days[0].unknownReason).toBe('UNIT_CONFLICT');
    expect(report.reason).toMatch(/different units/);
  });

  it('a KNOWN conflict surfaces even when another day in the interval is unknown', () => {
    // Capacity declared only for TUE; MON has no window. Two bookings clash on TUE; one booking sits on MON.
    const MON = '2026-03-09';
    const capTueOnly = capacity({ from: TUE, to: TUE, quantity: 1 });
    const clashTueA = booking({ projectId: PROJECT_A, from: TUE, to: TUE });
    const clashTueB = booking({ projectId: PROJECT_B, from: TUE, to: TUE });
    const lonelyMon = booking({ projectId: PROJECT_A, from: MON, to: MON });

    const report = assessResourceAcrossProjects(
      CRANE, [capTueOnly], [clashTueA, clashTueB, lonelyMon], { from: MON, to: TUE },
    );
    expect(report.feasibility).toBe('CONFLICTED');
    expect(report.conflictDays).toEqual([TUE]);
  });

  it('typed identity: a vehicle and an asset sharing a uuid are two resources', () => {
    const asAsset: ResourceRef = { resourceType: 'asset', canonicalResourceId: 'shared-uuid' };
    const asVehicle: ResourceRef = { resourceType: 'vehicle', canonicalResourceId: 'shared-uuid' };
    const vehicleCapacity = makeResourceCapacity({
      tenantId: TENANT, resource: asVehicle, unit: 'units', quantity: 5, from: '2026-03-01', to: '2026-03-31',
    });
    const assetBooking = commitBooking({
      tenantId: TENANT, projectId: PROJECT_A, resource: asAsset, unit: 'units', quantity: 1, from: TUE, to: TUE,
    });

    // The vehicle's capacity must NOT satisfy the asset's booking — different resource entirely.
    const report = assessResourceAcrossProjects(asAsset, [vehicleCapacity], [assetBooking], { from: TUE, to: TUE });
    expect(report.feasibility).toBe('UNKNOWN'); // no capacity for the ASSET
    expect(report.days[0].capacity).toBeNull();
  });
});

describe('resolveResourceLoad — the arithmetic underneath', () => {
  it('released bookings hold nothing and do not contribute', () => {
    const a = booking({ projectId: PROJECT_A });
    const b = releaseBooking(booking({ projectId: PROJECT_B }), { reason: 'crane returned to yard' });

    const [day] = resolveResourceLoad(CRANE, [capacity()], [a, b], { from: TUE, to: TUE });
    expect(day.committed).toBe(1);
    expect(day.contributors).toHaveLength(1);
    expect(day.contributors[0].projectId).toBe(PROJECT_A);
  });

  it('overlapping capacity windows sum within one unit (two hires, two cranes)', () => {
    const hireOne = capacity({ quantity: 1 });
    const hireTwo = capacity({ quantity: 1 });
    const a = booking({ projectId: PROJECT_A });
    const b = booking({ projectId: PROJECT_B });

    // Two windows → capacity 2; two bookings → committed 2 → fits.
    const report = assessResourceAcrossProjects(CRANE, [hireOne, hireTwo], [a, b], { from: TUE, to: TUE });
    expect(report.days[0].capacity).toBe(2);
    expect(report.feasibility).toBe('AVAILABLE');
  });

  it('is deterministic in its ordering — days and involved projects sorted', () => {
    const a = booking({ projectId: PROJECT_B, from: TUE, to: TUE });
    const b = booking({ projectId: PROJECT_A, from: TUE, to: TUE });
    const report = assessResourceAcrossProjects(CRANE, [capacity({ quantity: 1 })], [a, b], { from: TUE, to: TUE });
    expect(report.projectsInvolved).toEqual([PROJECT_A, PROJECT_B]); // sorted, regardless of input order
  });
});

describe('externalCommitmentsFor — the bridge to the pure planner', () => {
  it('returns other projects’ held bookings and excludes the asking project’s own', () => {
    const mine = booking({ projectId: PROJECT_A });
    const theirs = booking({ projectId: PROJECT_B });

    const external = externalCommitmentsFor(PROJECT_A, [mine, theirs]);
    expect(external).toHaveLength(1);
    expect(external[0].projectId).toBe(PROJECT_B);
    expect(external[0]).toMatchObject({ resource: CRANE, unit: 'units', quantity: 1, from: TUE, to: TUE });
  });

  it('excludes released bookings — they are not a live commitment', () => {
    const theirs = releaseBooking(booking({ projectId: PROJECT_B }), { reason: 'de-scoped' });
    expect(externalCommitmentsFor(PROJECT_A, [theirs])).toHaveLength(0);
  });
});
