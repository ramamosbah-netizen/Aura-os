import { describe, expect, it } from 'vitest';
import {
  RESOURCE_OWNER, RESOURCE_TYPES, RESOURCE_UNITS,
  isResourceType, isResourceUnit, resourceKey, sameResource, toResourceRef, unresolvedLabel,
  type ResourceRef,
} from './resource-ref';
import { sameResource as sameResourceViaPlanner } from './schedule-planning';

/**
 * §22 Step 3 — the reference every downstream record keys on.
 *
 * The cross-project conflict check is `ResourceRef` equality. If two references to one crane are
 * not equal, two projects each see a free crane and the whole section fails silently — so these
 * tests are about identity, not about a data structure.
 */

const ref = (resourceType: ResourceRef['resourceType'], canonicalResourceId: string): ResourceRef =>
  ({ resourceType, canonicalResourceId });

describe('identity is typed', () => {
  it('treats the same type and id as the same resource', () => {
    expect(sameResource(ref('asset', 'CR-01'), ref('asset', 'CR-01'))).toBe(true);
  });

  it('does NOT treat a vehicle and an asset sharing an id as one resource', () => {
    // Two registers, two resources. Comparing bare ids would make this indistinguishable, and a
    // conflict engine would then merge a van and a crane.
    const id = '11111111-1111-4111-8111-111111111111';
    expect(sameResource(ref('vehicle', id), ref('asset', id))).toBe(false);
  });

  it('does not resolve two spellings of a name to one resource', () => {
    // The failure this type exists to prevent: `PlantUsage.equipment` is free text, so `TC-01` and
    // `Tower Crane TC-01` are two cranes today and conflict with nothing.
    expect(sameResource(ref('asset', 'TC-01'), ref('asset', 'Tower Crane TC-01'))).toBe(false);
  });

  it('exposes one definition, not two', () => {
    // The planner re-exports rather than redefining. A second definition would be a second answer
    // to "is this the same crane?", and only one of them would be wired to any given verdict.
    expect(sameResourceViaPlanner).toBe(sameResource);
  });
});

describe('the map key is for grouping, never for storage', () => {
  it('is stable and distinguishes types', () => {
    expect(resourceKey(ref('pool', 'elv'))).toBe('pool:elv');
    expect(resourceKey(ref('asset', 'elv'))).not.toBe(resourceKey(ref('pool', 'elv')));
  });
});

describe('untrusted input is refused, not repaired', () => {
  it('accepts a well-formed reference and trims the id', () => {
    expect(toResourceRef({ resourceType: 'asset', canonicalResourceId: '  CR-01 ' }))
      .toEqual({ resourceType: 'asset', canonicalResourceId: 'CR-01' });
  });

  it('refuses an unknown type', () => {
    expect(toResourceRef({ resourceType: 'crane', canonicalResourceId: 'CR-01' })).toBeNull();
  });

  it('refuses an empty id rather than building a reference that matches nothing', () => {
    // A reference with no id would sit in a plan looking like a resource while making every
    // verdict about it vacuously fine — worse than being rejected outright.
    expect(toResourceRef({ resourceType: 'asset', canonicalResourceId: '' })).toBeNull();
    expect(toResourceRef({ resourceType: 'asset', canonicalResourceId: '   ' })).toBeNull();
    expect(toResourceRef({ resourceType: 'asset' })).toBeNull();
  });

  it('refuses things that are not references at all', () => {
    for (const v of [null, undefined, 'asset:CR-01', 42, []]) expect(toResourceRef(v)).toBeNull();
  });
});

describe('vocabulary', () => {
  it('names an owning register for every type', () => {
    for (const t of RESOURCE_TYPES) expect(RESOURCE_OWNER[t]).toBeTruthy();
    // Only the pool is Projects' own; the rest are referenced, never copied.
    expect(RESOURCE_OWNER).toEqual({ employee: 'hr', vehicle: 'fleet', asset: 'assets', pool: 'projects' });
  });

  it('guards types and units', () => {
    expect(isResourceType('asset')).toBe(true);
    expect(isResourceType('crane')).toBe(false);
    expect(isResourceUnit('persons')).toBe(true);
    expect(isResourceUnit('people')).toBe(false);
    expect(RESOURCE_UNITS).toEqual(['hours', 'persons', 'crews', 'units']);
  });
});

describe('a reference carries no copied master data', () => {
  it('has exactly two fields', () => {
    // No name, no plate, no serial. Those live in the owning register and are read through at
    // display time, so a rename lands everywhere and no second master can drift.
    expect(Object.keys(ref('asset', 'CR-01')).sort()).toEqual(['canonicalResourceId', 'resourceType']);
  });

  it('reports an unresolvable reference as not found, rather than inventing a label', () => {
    const r = ref('asset', 'deleted-crane');
    const label = unresolvedLabel(r);
    expect(label).toEqual({ ref: r, found: false });
    // Never the uuid dressed as a name, never a blank, never a cached last-known value — each of
    // those is a different way of pretending a deleted resource is still there.
    expect(label.label).toBeUndefined();
  });
});
