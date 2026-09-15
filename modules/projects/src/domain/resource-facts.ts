import type { Id } from '@aura/shared';
import { type ResourceRef, type ResourceUnit, sameResource } from './resource-ref';
import { type ResourceAvailabilityFact, availabilityCovers } from './resource-availability';
import { type ResourceCapacity, capacityOn } from './resource-pool';
import {
  type DayLoad,
  type ResourceBooking,
  bookingCovers,
  bookingIsHeld,
} from './resource-booking';
import { type WorkingCalendar, ALL_DAYS_WORKING, workingDaysInRange } from './working-calendar';
// `ResourceFeasibility` is defined once, in `schedule-planning.ts`, and imported here — a second
// declaration would be a second answer to a question §22 keeps to one.
import type { ExternalCommitment, ResolvedCapacity, ResourceFeasibility } from './schedule-planning';

/**
 * §22 Step 7 — the cross-project capacity engine (Design Gate §5.1, §5.2 #4).
 *
 * This is the layer the whole section exists for: the point where a resource's day-by-day facts stop
 * being SUPPLIED by a caller and start being COMPUTED across every project's held bookings. Steps 4
 * and 6 gave a resource a capacity and let one project commit against it; nothing yet looked at the
 * OTHER project. So two sites could each book the one tower crane next Tuesday and each be told it
 * was free — the exact failure §22 was opened to fix.
 *
 * WHERE IT SITS. Between the stores and the pure planner:
 *
 *   capacity windows · held bookings across every project        ← facts, from a store (a PORT)
 *                          ↓  resolveResourceLoad / this module   ← does the arithmetic, PURE
 *                    resolved planning facts                      ← plain data
 *                          ↓  planSchedule / assessBooking        ← already pure, already written
 *                        verdict
 *
 * Everything here is a PURE function of `(windows, bookings, interval)`. The querying — reading every
 * project's bookings for a resource — is the impure half and lives behind `ResourceFactsStore`
 * (`resource-facts-store.ts`), for the same reason the planner takes resolved facts as data: a rule
 * that queries is a rule you cannot test at every edge, and this is the rule that must not be wrong.
 *
 * THE DISCIPLINES IT INHERITS, unchanged, because a second answer to any of them would be a
 * regression (§1.3, §2, DG-22.3):
 *   - UNKNOWN capacity ≠ available, and ≠ a known zero. Zero demand against unknown capacity is still
 *     fine; positive demand against unknown capacity is UNKNOWN, never AVAILABLE.
 *   - a known capacity exceeded is CONFLICTED on that day even when other days are unknown — a real
 *     clash is never hidden behind a missing one.
 *   - quantities in different units are never summed or compared; a resource whose capacity and
 *     bookings disagree on the unit is UNKNOWN, with the disagreement named.
 *   - identity is TYPED (`sameResource`): a vehicle and an asset sharing a uuid are two resources.
 */

/** One held booking's share of a day's load — who holds it, so a conflict is visible on both sides. */
export interface BookingShare {
  bookingId: Id;
  projectId: Id;
  quantity: number;
  unit: ResourceUnit;
}

/** Why a day could not be compared. Absent when it could. */
export type DayUnknownReason = 'NONE_DECLARED' | 'UNKNOWN_QUANTITY' | 'UNIT_CONFLICT';

/** The full picture of one resource on one day, across every project. */
export interface ResourceLoadDay {
  day: string;
  /** `null` = UNKNOWN. Not zero, and not unlimited. */
  capacity: number | null;
  /** Total held across every project, in `unit`. */
  committed: number;
  /** The unit these numbers are in. `null` when nothing declares one and no booking implies one. */
  unit: ResourceUnit | null;
  /** `committed − capacity` when both are known, comparable, and committed exceeds capacity; else null. */
  overBy: number | null;
  /** Every held booking covering this day, whichever project holds it. */
  contributors: BookingShare[];
  /** Present when capacity and committed could not be compared for this day. */
  unknownReason?: DayUnknownReason;
  /**
   * What the owning register said about this resource on this day, when it said anything.
   *
   * Present for both effects: an `absent` day carries the reason its capacity is a known zero, and
   * an `unknown` day carries the reason nobody can state a capacity. Absent entirely when the
   * registers were silent and §22's own declared capacity stands.
   */
  unavailable?: { reason: string; source: string };
}

/**
 * A resource's feasibility over an interval, across every project (the "Resource Conflict" of
 * DG-22.5: committed > available, for one resource in one interval).
 */
export interface ResourceConflictReport {
  resource: ResourceRef;
  from: string;
  to: string;
  feasibility: ResourceFeasibility;
  /** Every day in the interval, in date order — the whole picture, not only the bad days. */
  days: ResourceLoadDay[];
  /** The days on which committed demand exceeds a known, comparable capacity. */
  conflictDays: string[];
  /** Distinct projects holding a booking that covers any day in the interval. */
  projectsInvolved: Id[];
  /** In the engine's own words, whenever the verdict is not a plain AVAILABLE. */
  reason?: string;
}

/** Held bookings for exactly this resource — typed equality, never a bare-id match. */
export const heldForResource = (
  bookings: readonly ResourceBooking[],
  resource: ResourceRef,
): ResourceBooking[] => bookings.filter((b) => bookingIsHeld(b) && sameResource(b.resource, resource));

/**
 * What one resource looks like on one day, given every capacity window and every held booking for it.
 *
 * The unit is anchored on the declared capacity when there is one; failing that, on the bookings, but
 * only if they agree. If the capacity's unit and a booking's unit disagree — or two bookings do — the
 * day is a UNIT_CONFLICT and its numbers are not comparable, because adding 4 persons to 40 hours
 * yields a figure that means nothing.
 */
function loadOnDay(
  resource: ResourceRef,
  windows: readonly ResourceCapacity[],
  held: readonly ResourceBooking[],
  day: string,
  availability: readonly ResourceAvailabilityFact[] = [],
): ResourceLoadDay {
  const cap = capacityOn(windows, day); // windows are pre-filtered to this resource by the caller
  const covering = held.filter((b) => bookingCovers(b, day));
  // The owning register's statement about THIS day, if it made one. `absent` outranks `unknown`:
  // a stated absence is knowledge, and a second statement that nobody can say does not erase it.
  const stated = availability.filter((fact) => availabilityCovers(fact, day));
  const said = stated.find((fact) => fact.effect === 'absent') ?? stated[0];
  const contributors: BookingShare[] = covering.map((b) => ({
    bookingId: b.id, projectId: b.projectId, quantity: b.quantity, unit: b.unit,
  }));

  if (said?.effect === 'absent') {
    /**
     * The resource is not there. Capacity is a KNOWN ZERO — not unknown, and not the number a
     * capacity window declared, because a window is a plan and this is a fact about the day.
     *
     * Deliberately settled BEFORE the unit check below. A unit disagreement normally makes a day
     * incomparable, and rightly: four persons cannot be weighed against forty hours. But none of
     * something is comparable with any positive demand in any unit — nothing is being converted,
     * only counted — so an absence is never downgraded to UNKNOWN by a unit mismatch it makes
     * irrelevant.
     */
    const committedWhileAbsent = sum(covering);
    return {
      day,
      capacity: 0,
      committed: committedWhileAbsent,
      unit: cap.unit ?? (covering.length > 0 ? covering[0].unit : null),
      overBy: committedWhileAbsent > 0 ? committedWhileAbsent : null,
      contributors,
      unavailable: { reason: said.reason, source: said.source },
    };
  }

  if (said?.effect === 'unknown') {
    // The register says it is out of service and cannot say until when. Capacity is unstatable —
    // which is never AVAILABLE, and is not a conflict either: nobody has claimed a number to break.
    const committedWhileUnknown = sum(covering);
    return {
      day,
      capacity: null,
      committed: committedWhileUnknown,
      unit: cap.unit ?? (covering.length > 0 ? covering[0].unit : null),
      overBy: null,
      contributors,
      ...(committedWhileUnknown > 0 ? { unknownReason: 'NONE_DECLARED' as const } : {}),
      unavailable: { reason: said.reason, source: said.source },
    };
  }

  const bookingUnits = new Set(covering.map((b) => b.unit));
  const unitsPresent = new Set<ResourceUnit>(bookingUnits);
  if (cap.unit !== null) unitsPresent.add(cap.unit);

  // More than one unit in play — capacity's and a booking's, or two bookings' — cannot be compared.
  if (unitsPresent.size > 1) {
    return {
      day, capacity: cap.quantity, committed: sum(covering), unit: cap.unit,
      overBy: null, contributors, unknownReason: 'UNIT_CONFLICT',
    };
  }

  const unit = cap.unit ?? (bookingUnits.size === 1 ? [...bookingUnits][0] : null);
  const committed = sum(covering);
  const capacity = cap.quantity;

  // Known capacity exceeded is a conflict; everything else that is not plainly comparable is unknown.
  const overBy = capacity !== null && committed > capacity ? committed - capacity : null;
  const unknownReason: DayUnknownReason | undefined =
    capacity === null && committed > 0
      ? (cap.unknownReason === 'UNIT_CONFLICT' ? 'UNIT_CONFLICT' : cap.unknownReason ?? 'NONE_DECLARED')
      : undefined;

  return { day, capacity, committed, unit, overBy, contributors, ...(unknownReason ? { unknownReason } : {}) };
}

const sum = (bookings: readonly ResourceBooking[]): number =>
  bookings.reduce((n, b) => n + b.quantity, 0);

/**
 * The day-by-day load of a resource across every project, over an inclusive interval.
 *
 * PURE. `bookings` is every held booking for the resource, from every project — the caller (a store
 * behind `ResourceFactsStore`) does the cross-project query; this function does the arithmetic.
 *
 * `calendar` (Step 8) restricts the assessment to WORKING days: a crane double-booked on a Friday
 * nobody works is not a conflict, the same reason the planner does not place task work on non-working
 * days. Supplied as data, defaulting to every-day-working so a caller with no calendar is unchanged.
 */
export function resolveResourceLoad(
  resource: ResourceRef,
  windows: readonly ResourceCapacity[],
  bookings: readonly ResourceBooking[],
  interval: { from: string; to: string },
  calendar: WorkingCalendar = ALL_DAYS_WORKING,
  availability: readonly ResourceAvailabilityFact[] = [],
): ResourceLoadDay[] {
  const myWindows = windows.filter((w) => sameResource(w.resource, resource));
  const held = heldForResource(bookings, resource);
  // Typed identity here too: a vehicle and an asset sharing a uuid are two resources, and one's
  // maintenance visit says nothing about the other.
  const mine = availability.filter((fact) => sameResource(fact.resource, resource));
  return workingDaysInRange(interval.from, interval.to, calendar)
    .map((day) => loadOnDay(resource, myWindows, held, day, mine));
}

/**
 * Assess a resource across every project over an interval — the headline Step 7 verdict.
 *
 * The tri-state follows the same order of precedence as `assessBooking`, one resource at a time:
 * a known capacity exceeded is CONFLICTED even when other days are unknown (a real clash is never
 * hidden behind a missing one); otherwise positive demand against an unknown or unit-mismatched
 * capacity is UNKNOWN; otherwise AVAILABLE.
 */
export function assessResourceAcrossProjects(
  resource: ResourceRef,
  windows: readonly ResourceCapacity[],
  bookings: readonly ResourceBooking[],
  interval: { from: string; to: string },
  calendar: WorkingCalendar = ALL_DAYS_WORKING,
  availability: readonly ResourceAvailabilityFact[] = [],
): ResourceConflictReport {
  const days = resolveResourceLoad(resource, windows, bookings, interval, calendar, availability);
  const conflictDays = days.filter((d) => d.overBy !== null).map((d) => d.day);
  const projectsInvolved = [
    ...new Set(days.flatMap((d) => d.contributors.map((c) => c.projectId))),
  ].sort();

  const base = { resource, from: interval.from, to: interval.to, days, conflictDays, projectsInvolved };

  if (conflictDays.length > 0) {
    const across = projectsInvolved.length > 1
      ? `, across ${projectsInvolved.length} projects`
      : '';
    const stated = [...new Set(days.filter((d) => d.overBy !== null && d.unavailable).map((d) => d.unavailable!.reason))];
    const because = stated.length > 0 ? ` — ${stated.join('; ')}` : '';
    return {
      ...base,
      feasibility: 'CONFLICTED',
      reason: `committed demand exceeds capacity on ${conflictDays.length} day(s)${across}${because}.`,
    };
  }

  const unitConflict = days.some((d) => d.unknownReason === 'UNIT_CONFLICT');
  const unknownDays = days.filter((d) => d.unknownReason !== undefined);
  if (unknownDays.length > 0) {
    return {
      ...base,
      feasibility: 'UNKNOWN',
      reason: unitConflict
        ? `capacity and bookings for this resource are measured in different units on ${unknownDays.length} day(s); they cannot be compared.`
        : `capacity is unknown on ${unknownDays.length} of the days a booking covers.`,
    };
  }

  return { ...base, feasibility: 'AVAILABLE' };
}

/**
 * The cross-project facts a booking is assessed against, built for `assessBooking`.
 *
 * `assessBooking` (Step 6) already derives one booking's CURRENT feasibility from a `DayLoad[]` whose
 * `committed` INCLUDES every project. This produces that array — so the same booking that fitted when
 * committed flips to CONFLICTED the instant another project books the last of a resource, and it does
 * so on BOTH projects' bookings at once. That is "visible on both", made concrete.
 */
export function dayLoadsForBooking(
  booking: Pick<ResourceBooking, 'resource' | 'from' | 'to'>,
  windows: readonly ResourceCapacity[],
  bookings: readonly ResourceBooking[],
  calendar: WorkingCalendar = ALL_DAYS_WORKING,
  availability: readonly ResourceAvailabilityFact[] = [],
): DayLoad[] {
  return resolveResourceLoad(
    booking.resource, windows, bookings, { from: booking.from, to: booking.to }, calendar, availability,
  ).map((d) => ({
    day: d.day, capacity: d.capacity, committed: d.committed, unit: d.unit,
    // Carried so the booking's own verdict can name the cause, not just the arithmetic.
    ...(d.unavailable ? { unavailableReason: d.unavailable.reason } : {}),
  }));
}

/**
 * Bridge to the pure planner (Design Gate §5.2 #4): the commitments held by OTHER projects on the
 * resources this project's plan cares about, as `ExternalCommitment[]`.
 *
 * A project's plan must count what everyone else has already committed, and must NOT double-count its
 * own bookings — those arrive as the plan's own demand. So this project's bookings are excluded by id.
 * Released bookings hold nothing and are excluded. The result feeds `planSchedule({ externalCommitments })`
 * with no further work.
 */
export function externalCommitmentsFor(
  projectId: Id,
  bookings: readonly ResourceBooking[],
): ExternalCommitment[] {
  return bookings
    .filter((b) => bookingIsHeld(b) && b.projectId !== projectId)
    .map((b) => ({
      resource: b.resource,
      unit: b.unit,
      quantity: b.quantity,
      from: b.from,
      to: b.to,
      projectId: b.projectId,
    }));
}

/**
 * Collapse a resource's day-by-day capacity windows into the ONE flat quantity the planner consumes.
 *
 * The planner's `ResolvedCapacity` is a single number per resource — the levelling engine is flat by
 * design (Step 1). This resolves that number as the tightest capacity that holds across the interval:
 * the MINIMUM known daily total. A day nobody declared a window for is outside this resource's
 * availability and does not lower the floor; a day with an UNKNOWN quantity or a unit conflict poisons
 * it to `null`, because "known on four days out of five" is not known. If nothing is ever declared,
 * the answer is `null` — UNKNOWN, never a fabricated zero or infinity.
 */
function flatCapacity(
  refWindows: readonly ResourceCapacity[],
  interval: { from: string; to: string },
  calendar: WorkingCalendar,
): { unit: ResourceUnit; quantity: number | null } {
  const unit = refWindows[0].unit;
  let min = Infinity;
  let known = false;
  for (const day of workingDaysInRange(interval.from, interval.to, calendar)) {
    const c = capacityOn(refWindows, day);
    if (c.quantity === null) {
      // A day no window covers is simply outside this resource's availability — not a gap in
      // knowledge. Only a declared-but-unknown quantity, or a unit conflict, poisons the floor.
      if (c.unknownReason && c.unknownReason !== 'NONE_DECLARED') return { unit, quantity: null };
      continue;
    }
    known = true;
    min = Math.min(min, c.quantity);
  }
  return { unit, quantity: known ? min : null };
}

/** The facts a project's plan is resolved against: flat capacities and OTHER projects' commitments. */
export interface ResolvedPlanFacts {
  capacities: ResolvedCapacity[];
  externalCommitments: ExternalCommitment[];
}

/**
 * Assemble the resolved facts a planning run consumes, from stored windows and cross-project bookings.
 *
 * This is the bridge the Resolver (Step 7) hands the planner: a flat capacity per resource that has a
 * declared window, plus every OTHER project's held commitment as a per-day external claim. A resource
 * with no window at all is omitted, so the planner reports it UNKNOWN ("none declared") rather than
 * available — the §22 correction, preserved end to end.
 */
export function resolvePlanFacts(
  projectId: Id,
  refs: readonly ResourceRef[],
  windows: readonly ResourceCapacity[],
  bookings: readonly ResourceBooking[],
  interval: { from: string; to: string },
  calendar: WorkingCalendar = ALL_DAYS_WORKING,
): ResolvedPlanFacts {
  const capacities: ResolvedCapacity[] = [];
  for (const resource of dedupeRefs(refs)) {
    const refWindows = windows.filter((w) => sameResource(w.resource, resource));
    if (refWindows.length === 0) continue; // no window → planner reports UNKNOWN, never available
    const flat = flatCapacity(refWindows, interval, calendar);
    capacities.push({ resource, unit: flat.unit, quantity: flat.quantity });
  }
  return { capacities, externalCommitments: externalCommitmentsFor(projectId, bookings) };
}

/** Distinct references by typed identity — the refs a schedule's requirements name, without repeats. */
export function dedupeRefs(refs: readonly ResourceRef[]): ResourceRef[] {
  const out: ResourceRef[] = [];
  for (const r of refs) if (!out.some((o) => sameResource(o, r))) out.push(r);
  return out;
}
