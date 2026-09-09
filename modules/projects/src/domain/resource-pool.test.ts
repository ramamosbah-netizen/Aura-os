import { describe, expect, it } from 'vitest';
import {
  capacityCovers, capacityOn, makeResourceCapacity, makeResourcePool, poolRef,
  type NewResourceCapacity, type ResourceCapacity,
} from './resource-pool';
import type { ResourceRef } from './resource-ref';

/**
 * §22 Step 4 — pools and capacity.
 *
 * The rule under all of it: a capacity that nobody has declared is UNKNOWN, and unknown is not a
 * quiet form of "plenty". The previous planner turned an absent capacity into `Infinity`, reported
 * `overallocated: false`, and told two projects a booked crane was free.
 */

const crane: ResourceRef = { resourceType: 'asset', canonicalResourceId: 'CR-01' };

const pool = (over: Parameters<typeof makeResourcePool>[0] extends never ? never : Partial<Parameters<typeof makeResourcePool>[0]> = {}) =>
  makeResourcePool({ tenantId: 't1', name: 'Electricians', unit: 'persons', ...over });

const capacity = (over: Partial<NewResourceCapacity> = {}): ResourceCapacity =>
  makeResourceCapacity({
    tenantId: 't1', resource: crane, unit: 'units', quantity: 1,
    from: '2026-07-01', to: '2026-07-31', ...over,
  });

describe('a pool is organisation-scoped, never project-owned', () => {
  it('carries no projectId at all', () => {
    // Design Gate §3.1, normative. A pool scoped to a project could never answer the question §22
    // exists for, because each project would own a private copy of the same twelve electricians.
    expect(pool()).not.toHaveProperty('projectId');
  });

  it('is not global by default — scope is stated, including when it is tenant-wide', () => {
    expect(pool().orgNodeId).toBeNull();
    expect(pool({ orgNodeId: 'org-dubai' }).orgNodeId).toBe('org-dubai');
  });

  it('is addressed like any other resource', () => {
    const p = pool();
    expect(poolRef(p)).toEqual({ resourceType: 'pool', canonicalResourceId: p.id });
  });
});

describe('a pool is not a supplier', () => {
  it('records the supplier as provenance, and keeps its own identity', () => {
    // One subcontractor fields several crews — Crew A, Crew B, a testing team — each with its own
    // capacity and commitments. supplierId is where a crew came from, never who it is.
    const a = pool({ name: 'ELV Crew A', sourceType: 'subcontractor', sourceId: 'supplier-abc' });
    const b = pool({ name: 'ELV Crew B', sourceType: 'subcontractor', sourceId: 'supplier-abc' });
    expect(a.sourceId).toBe('supplier-abc');
    expect(b.sourceId).toBe('supplier-abc');
    expect(a.id).not.toBe(b.id);
  });

  it('refuses a subcontracted crew with nobody behind it', () => {
    // The point of recording the source is that a shared crew's capacity has an accountable owner.
    expect(() => pool({ sourceType: 'subcontractor', sourceId: null }))
      .toThrow(/requires the supplier it belongs to/);
  });

  it('does not require a supplier for an internal pool', () => {
    expect(pool({ sourceType: 'internal' }).sourceId).toBeNull();
  });
});

describe('capacity validation', () => {
  it('accepts a known zero — a real and different fact from unknown', () => {
    expect(capacity({ quantity: 0 }).quantity).toBe(0);
  });

  it('accepts null, meaning unknown', () => {
    expect(capacity({ quantity: null }).quantity).toBeNull();
  });

  it('refuses a negative quantity, a backwards interval and a bad unit', () => {
    expect(() => capacity({ quantity: -1 })).toThrow(/zero or more/);
    expect(() => capacity({ from: '2026-07-31', to: '2026-07-01' })).toThrow(/on or after/);
    expect(() => makeResourceCapacity({
      tenantId: 't1', resource: crane, unit: 'people' as never, quantity: 1,
      from: '2026-07-01', to: '2026-07-02',
    })).toThrow(/unit must be/);
  });

  it('covers its interval inclusively', () => {
    const c = capacity({ from: '2026-07-01', to: '2026-07-03' });
    expect(capacityCovers(c, '2026-07-01')).toBe(true);
    expect(capacityCovers(c, '2026-07-03')).toBe(true);
    expect(capacityCovers(c, '2026-06-30')).toBe(false);
    expect(capacityCovers(c, '2026-07-04')).toBe(false);
  });
});

describe('capacity on a day', () => {
  it('is UNKNOWN when nothing declares one — not zero, and not unlimited', () => {
    expect(capacityOn([], '2026-07-10')).toEqual({
      quantity: null, unit: null, unknownReason: 'NONE_DECLARED',
    });
  });

  it('is UNKNOWN outside every declared window', () => {
    const c = capacity({ from: '2026-07-01', to: '2026-07-05' });
    expect(capacityOn([c], '2026-08-01').unknownReason).toBe('NONE_DECLARED');
  });

  it('sums overlapping windows in the same unit', () => {
    // Two hire periods for the same crane genuinely give two cranes that week.
    const a = capacity({ quantity: 1, from: '2026-07-01', to: '2026-07-31' });
    const b = capacity({ quantity: 1, from: '2026-07-10', to: '2026-07-20' });
    expect(capacityOn([a, b], '2026-07-15')).toEqual({ quantity: 2, unit: 'units' });
    expect(capacityOn([a, b], '2026-07-05')).toEqual({ quantity: 1, unit: 'units' });
  });

  it('refuses to add quantities in different units', () => {
    // 4 persons plus 40 hours is a number that means nothing. Implicit conversion is exactly what
    // the gate forbids, and the honest answer is that the question cannot be asked this way.
    const persons = capacity({ unit: 'persons', quantity: 4 });
    const hours = capacity({ unit: 'hours', quantity: 40 });
    expect(capacityOn([persons, hours], '2026-07-15')).toEqual({
      quantity: null, unit: null, unknownReason: 'UNIT_CONFLICT',
    });
  });

  it('lets one unknown window poison the day, rather than quietly reporting the rest', () => {
    // If one of two hire windows has no stated size, the total is NOT "the other one". Reporting 1
    // would under-state the capacity and over-state the confidence at the same time.
    const known = capacity({ quantity: 1 });
    const unknown = capacity({ quantity: null });
    expect(capacityOn([known, unknown], '2026-07-15')).toEqual({
      quantity: null, unit: 'units', unknownReason: 'UNKNOWN_QUANTITY',
    });
  });

  it('reports a declared zero as zero, which is knowable and actionable', () => {
    const none = capacity({ quantity: 0 });
    expect(capacityOn([none], '2026-07-15')).toEqual({ quantity: 0, unit: 'units' });
  });
});
