/**
 * §22 Step 3 — `ResourceRef`: how §22 names a resource it does not own.
 *
 * Everything downstream keys on this: capacity, requirements, bookings, and the cross-project
 * conflict check that decides whether one crane is committed to two sites on the same Tuesday.
 * That check is `ResourceRef` equality, which is why the shape matters more than it looks.
 *
 * THE RULE (DG-22.2): §22 REFERENCES resources, it never copies them. A reference carries a type
 * and an id in the OWNING register — never a name, a plate number or a serial. Those are read
 * through at display time, so a renamed asset is renamed everywhere and no second master exists to
 * drift out of date.
 *
 * Extracted from `schedule-planning.ts`, where it was introduced for the planner. It is not a
 * planner detail: it is the vocabulary every §22 record shares.
 */

/**
 * Where a resource's identity lives.
 *
 * | type       | owning register                | identity                    |
 * |------------|--------------------------------|-----------------------------|
 * | `employee` | HR `Employee`                  | uuid                        |
 * | `vehicle`  | Fleet `Vehicle`                | uuid (plate is a label)     |
 * | `asset`    | Assets `Asset`                 | uuid (serial is a label)    |
 * | `pool`     | Resource Planning `ResourcePool` | uuid                      |
 *
 * `pool` is the one §22 owns, and it is still a reference rather than an inline value — a pool has
 * a capacity, a scope and a lifecycle of its own, and a requirement pointing at one must not carry
 * a copy of any of that.
 *
 * Deliberately NOT a free string. `PlantUsage.equipment` is free text — "description or asset
 * code" — which is why `TC-01` and `Tower Crane TC-01` are two cranes to the system today and
 * conflict with nothing.
 */
export type ResourceType = 'employee' | 'vehicle' | 'asset' | 'pool';

export const RESOURCE_TYPES: readonly ResourceType[] = ['employee', 'vehicle', 'asset', 'pool'];

/** Which module owns each type's identity. Documentation the code can assert against. */
export const RESOURCE_OWNER: Record<ResourceType, string> = {
  employee: 'hr',
  vehicle: 'fleet',
  asset: 'assets',
  pool: 'projects',
};

export interface ResourceRef {
  resourceType: ResourceType;
  /** The id in the owning register. Never a name, a code, a plate or a serial. */
  canonicalResourceId: string;
}

/**
 * Are these the same resource?
 *
 * TYPED equality, because a vehicle and an asset that happen to share a uuid are two resources, and
 * comparing bare ids would make that indistinguishable. Every conflict verdict in §22 rests on
 * this function.
 */
export const sameResource = (a: ResourceRef, b: ResourceRef): boolean =>
  a.resourceType === b.resourceType && a.canonicalResourceId === b.canonicalResourceId;

/**
 * A stable map key.
 *
 * For grouping only. Equality is `sameResource`; this string exists because `Map` cannot key on an
 * object, and it must never become the stored form — two columns are what let the database index
 * and constrain a reference.
 */
export const resourceKey = (r: ResourceRef): string => `${r.resourceType}:${r.canonicalResourceId}`;

export const isResourceType = (v: unknown): v is ResourceType =>
  typeof v === 'string' && (RESOURCE_TYPES as readonly string[]).includes(v);

/**
 * Build a reference from untrusted input, refusing anything that is not one.
 *
 * Returns null rather than a partial reference. A reference with an empty id would match nothing
 * and conflict with nothing, which is worse than being rejected: it would sit in a plan looking
 * like a resource while making every verdict about it vacuously fine.
 */
export function toResourceRef(value: unknown): ResourceRef | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const id = typeof v.canonicalResourceId === 'string' ? v.canonicalResourceId.trim() : '';
  if (!isResourceType(v.resourceType) || !id) return null;
  return { resourceType: v.resourceType, canonicalResourceId: id };
}

/** What a quantity counts. Quantities of different units are never summed or compared. */
export type ResourceUnit = 'hours' | 'persons' | 'crews' | 'units';

export const RESOURCE_UNITS: readonly ResourceUnit[] = ['hours', 'persons', 'crews', 'units'];

export const isResourceUnit = (v: unknown): v is ResourceUnit =>
  typeof v === 'string' && (RESOURCE_UNITS as readonly string[]).includes(v);

// ── Display: read through, never stored ───────────────────────────────────

/**
 * What a reference looks like to a person.
 *
 * `found: false` is a first-class answer. A reference whose target has been deleted must say so —
 * rendering the uuid, or a blank, or the last name anyone happened to cache, would each be a
 * different way of pretending the resource is still there. This is the same discipline as §24's
 * UNKNOWN and the planner's: an unanswerable question is reported, not smoothed over.
 */
export interface ResourceLabel {
  ref: ResourceRef;
  found: boolean;
  /** The resource's own name in its own register. Absent when `found` is false. */
  label?: string;
  /** Something that disambiguates two similarly named resources — a plate, a serial, a trade. */
  secondary?: string;
  /** Where the resource is actually managed. Never a §22 route: §22 does not own it. */
  href?: string;
}

/**
 * Resolves references to labels, bound at the composition root.
 *
 * A PORT rather than a direct call, because Projects may not import HR, Fleet or Assets
 * (ADR-0004). The implementations live at the app layer, exactly as §24's health providers do.
 *
 * An UNBOUND resolver is a real state, not an error: §22 works without labels — a conflict between
 * two references is still a conflict — so callers render the reference plainly and no verdict
 * changes. What must never happen is a fabricated name.
 */
export const RESOURCE_LABEL_RESOLVER = Symbol('RESOURCE_LABEL_RESOLVER');

export interface ResourceLabelResolver {
  /**
   * Resolve a batch. Batched because a plan names many resources and one round trip per row is how
   * a planning screen becomes slow enough that people stop opening it.
   */
  resolve(tenantId: string, refs: readonly ResourceRef[]): Promise<ResourceLabel[]>;
}

/** The honest answer when no resolver is bound, or a reference does not resolve. */
export const unresolvedLabel = (ref: ResourceRef): ResourceLabel => ({ ref, found: false });
