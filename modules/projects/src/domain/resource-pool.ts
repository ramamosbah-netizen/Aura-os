import { type Id, newId } from '@aura/shared';
import { type ResourceRef, type ResourceUnit, isResourceUnit } from './resource-ref';

/**
 * §22 Step 4 — pools and capacity.
 *
 * AUTHORITY (Design Gate §3.1, normative): `ResourcePool` is an **organization-scoped planning
 * authority**, currently implemented within the Projects bounded implementation because Resource
 * Planning is its only proven consumer. It is **not project-owned** and carries no `projectId`
 * ownership semantics. A Rule-of-Three review is required when another bounded context becomes a
 * genuine consumer.
 *
 * That is not a technicality. A pool scoped to a project could never answer the question §22
 * exists for — the same crew committed on two sites next Tuesday — because each project would own
 * a private copy of the same twelve electricians.
 *
 *   ResourcePool  (tenant / org scoped)
 *        ├── Project A bookings
 *        └── Project B bookings
 *
 * CAPACITY IS A MEASUREMENT CONTRACT, NOT A SHARED MEANING (DG-22.3). A person has hours, a trade
 * has a headcount, a crane has one of itself. No attempt is made to make those mean the same
 * thing; what is unified is how they are MEASURED — unit, quantity, interval, calendar, scope —
 * and quantities in different units are never summed or compared.
 */

/** Where a pool's people or plant actually come from. */
export type PoolSourceType = 'internal' | 'subcontractor';

/**
 * A named, countable group of interchangeable capacity.
 *
 * A pool is NOT a supplier. `Supplier(category='subcontractor')` identifies the COMPANY; one
 * subcontractor fields several crews — "ELV Installation Crew A", "Crew B", "Testing Team" — each
 * with its own capacity and its own commitments. So `sourceId` records where a pool came from and
 * is never used as the pool's identity.
 */
export interface ResourcePool {
  id: Id;
  tenantId: Id;
  name: string;
  /** What one unit of this pool is. Fixed at creation: changing it reinterprets every booking. */
  unit: ResourceUnit;
  sourceType: PoolSourceType;
  /** The supplier this crew belongs to, when it is subcontracted. Provenance, never identity. */
  sourceId: Id | null;
  /**
   * The organisational node this pool belongs to — the approved scope mechanism (DG-22.9).
   *
   * An `OrgNode` reference, because that tree exists, nests, and already carries containment
   * semantics. NOT `branch_id`: that was a bare text column with no register, no name and no
   * parent — §22 routed around it, and AURA-ORG-001 has since removed it entirely (migration 0294).
   *
   * `null` means tenant-wide. A pool is never global by DEFAULT — this is a stated choice.
   */
  orgNodeId: Id | null;
  createdAt: string;
  createdBy: Id | null;
  updatedAt: string;
}

export interface NewResourcePool {
  tenantId: Id;
  name: string;
  unit: ResourceUnit;
  sourceType?: PoolSourceType;
  sourceId?: Id | null;
  orgNodeId?: Id | null;
  createdBy?: Id | null;
}

export function makeResourcePool(input: NewResourcePool): ResourcePool {
  if (!input.name?.trim()) throw new Error('resource pool name is required');
  if (!isResourceUnit(input.unit)) throw new Error('resource pool unit must be hours, persons, crews or units');
  const sourceType = input.sourceType ?? 'internal';
  if (sourceType === 'subcontractor' && !input.sourceId) {
    // A subcontracted crew with no supplier behind it cannot be traced to anyone. The whole reason
    // to record the source is so a shared crew's capacity has an accountable owner.
    throw new Error('a subcontracted pool requires the supplier it belongs to');
  }
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    name: input.name.trim(),
    unit: input.unit,
    sourceType,
    sourceId: input.sourceId ?? null,
    orgNodeId: input.orgNodeId ?? null,
    createdAt: now,
    createdBy: input.createdBy ?? null,
    updatedAt: now,
  };
}

/** A pool addressed the way everything else in §22 addresses a resource. */
export const poolRef = (pool: Pick<ResourcePool, 'id'>): ResourceRef =>
  ({ resourceType: 'pool', canonicalResourceId: pool.id });

// ── Capacity ──────────────────────────────────────────────────────────────

/**
 * How much of a resource is available, over an interval, measured in one unit.
 *
 * `quantity` is `number | null`, and `null` means UNKNOWN — not zero, not unlimited. That
 * distinction is the whole §22 correction: the previous planner turned an absent capacity into
 * `Infinity`, reported `overallocated: false`, and told two projects a booked crane was free.
 */
export interface ResourceCapacity {
  id: Id;
  tenantId: Id;
  resource: ResourceRef;
  unit: ResourceUnit;
  /** `null` = UNKNOWN. A known zero is a different fact and yields CONFLICTED against demand. */
  quantity: number | null;
  /** Inclusive dates. */
  from: string;
  to: string;
  /** Which working calendar the quantity is expressed against (`@aura/core` owns calendars). */
  calendarId: Id | null;
  /** The org node this capacity applies within. `null` = tenant-wide. */
  orgNodeId: Id | null;
  /** Why it is what it is — a shift pattern, a hire period, a maintenance window. */
  note: string | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewResourceCapacity {
  tenantId: Id;
  resource: ResourceRef;
  unit: ResourceUnit;
  quantity: number | null;
  from: string;
  to: string;
  calendarId?: Id | null;
  orgNodeId?: Id | null;
  note?: string | null;
  createdBy?: Id | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function makeResourceCapacity(input: NewResourceCapacity): ResourceCapacity {
  if (!input.resource?.canonicalResourceId) throw new Error('capacity requires a resource reference');
  if (!isResourceUnit(input.unit)) throw new Error('capacity unit must be hours, persons, crews or units');
  if (!DATE.test(input.from) || !DATE.test(input.to)) throw new Error('capacity dates must be YYYY-MM-DD');
  if (input.to < input.from) throw new Error('capacity `to` must be on or after `from`');
  if (input.quantity !== null) {
    if (!Number.isFinite(input.quantity) || input.quantity < 0) {
      throw new Error('capacity quantity must be zero or more, or null when it is unknown');
    }
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    resource: input.resource,
    unit: input.unit,
    quantity: input.quantity,
    from: input.from,
    to: input.to,
    calendarId: input.calendarId ?? null,
    orgNodeId: input.orgNodeId ?? null,
    note: input.note?.trim() || null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Does this capacity window cover the given date? */
export const capacityCovers = (c: Pick<ResourceCapacity, 'from' | 'to'>, day: string): boolean =>
  day >= c.from && day <= c.to;

export interface CapacityOnDay {
  /** `null` when nothing declares a capacity for that day, or units disagree. */
  quantity: number | null;
  unit: ResourceUnit | null;
  /** Present when the answer is null, saying which kind of not-knowing it is. */
  unknownReason?: 'NONE_DECLARED' | 'UNKNOWN_QUANTITY' | 'UNIT_CONFLICT';
}

/**
 * The capacity of one resource on one day.
 *
 * Overlapping windows are summed — two hire periods for the same crane genuinely give two cranes —
 * but ONLY within one unit. If two windows for the same resource disagree about the unit, the
 * answer is `UNIT_CONFLICT` and null: adding 4 persons to 40 hours would produce a number that
 * means nothing, and the gate forbids implicit conversion precisely here.
 *
 * A single window with an UNKNOWN quantity poisons the day's answer rather than being skipped. If
 * one of two hire windows has no stated size, the total is not "the other one" — it is unknown,
 * and saying otherwise would under-report the capacity or over-report the confidence.
 */
export function capacityOn(windows: readonly ResourceCapacity[], day: string): CapacityOnDay {
  const covering = windows.filter((w) => capacityCovers(w, day));
  if (covering.length === 0) return { quantity: null, unit: null, unknownReason: 'NONE_DECLARED' };

  const units = new Set(covering.map((w) => w.unit));
  if (units.size > 1) {
    return { quantity: null, unit: null, unknownReason: 'UNIT_CONFLICT' };
  }
  const unit = covering[0].unit;
  if (covering.some((w) => w.quantity === null)) {
    return { quantity: null, unit, unknownReason: 'UNKNOWN_QUANTITY' };
  }
  return { quantity: covering.reduce((sum, w) => sum + (w.quantity ?? 0), 0), unit };
}
