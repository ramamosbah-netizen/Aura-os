import { type Id, newId } from '@aura/shared';
import { type ResourceRef, type ResourceUnit, isResourceUnit, toResourceRef } from './resource-ref';
import { type WorkingCalendar, ALL_DAYS_WORKING, eachDay } from './working-calendar';

/**
 * §22 Step 6 — bookings: a project's committed claim on capacity.
 *
 * THE TEMPORAL INVARIANT (Design Gate §1.1, normative):
 *
 *   > A booking is valid AT CREATION only if capacity was available at that time. A later
 *   > availability change does not rewrite history and does not reject the owning domain's change;
 *   > it changes the booking's CURRENT FEASIBILITY and creates a visible resource conflict
 *   > requiring resolution.
 *
 * Two properties, and conflating them is the trap the whole design turns on:
 *
 *   creation validity     settled once, at commitment, never revised   -> STORED
 *   current feasibility   recomputed against today's availability      -> NEVER STORED
 *
 * A booking that was valid yesterday can be conflicted today WITHOUT THE RECORD BECOMING INVALID.
 * Someone books a crew of eight for Tuesday; two of them are later granted leave. The booking was
 * right when it was made and is not right now, and both of those are true at once. A system with
 * one field for this has to pick which truth to lose.
 *
 * WHY FEASIBILITY IS NOT A COLUMN. A stored verdict is a verdict as of the last time somebody
 * remembered to recompute it. Capacity changes for reasons that have nothing to do with this
 * project — an HR leave approval, a breakdown, another project's booking — so a persisted
 * `feasible` flag is wrong the instant any of those happens, and wrong quietly. It is derived on
 * every read, from facts that are current by construction.
 *
 * WHAT A BOOKING DOES NOT DO (DG-22.8: governed commitment, not hard lock). It does not reserve in
 * the sense of preventing anyone else. HR may still approve the leave; another project may still
 * book the crane. Projects must not become a hidden HR approval authority, and HR must not delete
 * a booking to make the numbers agree. The conflict SURFACES and a planner resolves it — replace
 * the resource, raise capacity, move the task, reduce the requirement, approve overtime, or accept
 * the exposure knowingly.
 */

export type BookingStatus = 'held' | 'released';

export interface ResourceBooking {
  id: Id;
  tenantId: Id;
  /** The project making the commitment. Bookings ARE project-scoped; pools and capacity are not. */
  projectId: Id;
  /** The requirement this satisfies, when it came from one. Null for a directly made booking. */
  requirementId: Id | null;
  resource: ResourceRef;
  unit: ResourceUnit;
  /**
   * How much is held ON EACH DAY of the range — not a total spread across it.
   *
   * "4 electricians, Monday to Friday" holds four on Monday and four on Friday; it does not hold
   * four fifths of an electrician per day. This is the only reading under which a day-by-day
   * capacity comparison means anything, so it is stated rather than left to the reader.
   */
  quantity: number;
  /** Inclusive. */
  from: string;
  to: string;
  status: BookingStatus;

  // -- Creation validity: written once, never revised -----------------------
  /**
   * The tightest known capacity across the booked days, as judged at commitment.
   *
   * `null` records that it was committed against an UNKNOWN capacity — which is permitted, and
   * important to know later, because "nobody had recorded the capacity" and "we knew, and it
   * changed" are different conversations with different people.
   */
  capacityAtCommitment: number | null;
  /** Total demand on the tightest day, this booking included, as judged at commitment. */
  demandAtCommitment: number;
  /**
   * Why it was committed anyway, when it demonstrably did not fit.
   *
   * This is what makes DG-22.8's "governed" concrete. Committing over a KNOWN capacity is allowed
   * — overtime gets approved, hires get arranged, and a planner who cannot record the commitment
   * will simply not record it, which is the one outcome that helps nobody. But it may not happen
   * by accident, so it costs a sentence.
   */
  overCapacityReason: string | null;
  committedAt: string;
  committedBy: Id | null;

  /** Why it was given up. Required to release, for the reason §21 requires a resolution note. */
  releasedReason: string | null;
  releasedAt: string | null;
  releasedBy: Id | null;
}

export interface NewResourceBooking {
  tenantId: Id;
  projectId: Id;
  requirementId?: Id | null;
  resource: ResourceRef;
  unit: ResourceUnit;
  quantity: number;
  from: string;
  to: string;
  /** Required only when the booking does not fit a KNOWN capacity. */
  overCapacityReason?: string | null;
  committedBy?: Id | null;
}

/**
 * What was true about one day when the commitment was made.
 *
 * `alreadyCommitted` EXCLUDES the booking being made — `commitBooking` adds it. The field is named
 * for what it holds rather than "committed", because reading it as "including this one" is an
 * off-by-one that makes an over-capacity booking look like it fits.
 */
export interface DayAvailability {
  day: string;
  /** `null` = UNKNOWN. Not zero, which is a real and knowable fact, and not unlimited. */
  capacity: number | null;
  alreadyCommitted: number;
  /** The unit `capacity` and `alreadyCommitted` are expressed in. `null` when none is declared. */
  unit: ResourceUnit | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every CALENDAR date in an inclusive range. Which of them are working days is a calendar's answer
 * (Step 8) — `assessBooking` takes a `WorkingCalendar` and asks; this stays the raw enumeration.
 */
export const bookingDays = (from: string, to: string): string[] => eachDay(from, to);

function validate(input: NewResourceBooking): { resource: ResourceRef; quantity: number } {
  const resource = toResourceRef(input.resource);
  if (!resource) throw new Error('a booking must name a valid resource: a known type and a non-empty id');
  if (!input.projectId) throw new Error('a booking must belong to a project');
  if (!isResourceUnit(input.unit)) throw new Error('a booking must be measured in hours, persons, crews or units');
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    // Zero held is not a booking, it is the absence of one — and it would be counted by every
    // rollup while committing nothing, the same false confidence a zero requirement carries.
    throw new Error('a booking must be for more than zero');
  }
  if (!DATE.test(input.from) || !DATE.test(input.to)) throw new Error('booking dates must be YYYY-MM-DD');
  if (input.to < input.from) throw new Error('a booking must end on or after it starts');
  return { resource, quantity };
}

/**
 * The judgement made at commitment: does this fit, on the day it fits least well?
 *
 * The TIGHTEST day decides. A booking that fits on four days and not on the fifth does not fit;
 * recording an average would let a genuine Tuesday clash disappear into a comfortable week.
 *
 * Capacity counts as unknown for the whole booking if it is unknown on ANY covered day — the same
 * poisoning discipline as `capacityOn`. Knowing four days out of five is not knowing, and rounding
 * that up to "fits" is how the previous planner told two projects a booked crane was free.
 */
function judge(
  input: { unit: ResourceUnit; quantity: number; from: string; to: string },
  availability: readonly DayAvailability[],
): { capacity: number | null; demand: number } {
  const covered = availability.filter((d) => d.day >= input.from && d.day <= input.to);
  const seen = new Set(covered.map((d) => d.day));
  // A quantity in another unit cannot be compared with this one, so it is not knowledge either.
  const comparable = covered.filter((d) => d.unit === null || d.unit === input.unit);

  const unknown =
    bookingDays(input.from, input.to).some((d) => !seen.has(d)) ||
    comparable.length !== covered.length ||
    comparable.some((d) => d.capacity === null);

  const demand = comparable.length === 0
    ? input.quantity
    : Math.max(...comparable.map((d) => d.alreadyCommitted + input.quantity));

  if (unknown) return { capacity: null, demand };
  return { capacity: Math.min(...comparable.map((d) => d.capacity as number)), demand };
}

/**
 * Commit a booking against what is known right now.
 *
 * The snapshot is DERIVED here rather than accepted from the caller. A caller-supplied
 * `capacityAtCommitment` is a number nobody can check afterwards, and the entire value of the
 * creation-validity half of the invariant is that it records what was actually true.
 */
export function commitBooking(
  input: NewResourceBooking,
  availability: readonly DayAvailability[] = [],
): ResourceBooking {
  const { resource, quantity } = validate(input);
  const { capacity, demand } = judge({ ...input, quantity }, availability);
  const overCapacity = capacity !== null && demand > capacity;

  const reason = input.overCapacityReason?.trim() || null;
  if (overCapacity && !reason) {
    // Governed, not blocked. It is permitted to commit over a known capacity — but not silently,
    // because the next person to read this needs to know whether it was a decision or a mistake.
    throw new Error(
      'this booking exceeds the capacity known for the resource; committing it anyway requires a reason',
    );
  }

  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    requirementId: input.requirementId ?? null,
    resource,
    unit: input.unit,
    quantity,
    from: input.from,
    to: input.to,
    status: 'held',
    capacityAtCommitment: capacity,
    demandAtCommitment: demand,
    // Kept only where it means something. A reason attached to a booking that fitted would read,
    // later, as evidence of an overrun that never happened.
    overCapacityReason: overCapacity ? reason : null,
    committedAt: new Date().toISOString(),
    committedBy: input.committedBy ?? null,
    releasedReason: null,
    releasedAt: null,
    releasedBy: null,
  };
}

/**
 * Was this booking within capacity at the moment it was made?
 *
 * Reads the snapshot; computes nothing. The answer never changes, which is the point — it records
 * a judgement, and re-deriving it from today's facts would erase the distinction the temporal
 * invariant exists to keep.
 */
export function wasValidAtCommitment(b: ResourceBooking): boolean | null {
  // Null, not false: committed without a known capacity is a third answer, and calling it invalid
  // would blame a planner for a fact nobody had recorded.
  if (b.capacityAtCommitment === null) return null;
  return b.demandAtCommitment <= b.capacityAtCommitment;
}

/** Give up a booking. The capacity is released; the record and its history are not deleted. */
export function releaseBooking(b: ResourceBooking, input: { reason: string; actorId?: Id | null }): ResourceBooking {
  if (b.status === 'released') throw new Error('this booking has already been released');
  if (!input.reason?.trim()) {
    // A release with no reason is indistinguishable from a mistake, and the capacity it frees will
    // be re-committed by someone who cannot tell which it was.
    throw new Error('releasing a booking requires a reason');
  }
  return {
    ...b,
    status: 'released',
    releasedReason: input.reason.trim(),
    releasedAt: new Date().toISOString(),
    releasedBy: input.actorId ?? null,
  };
}

export const bookingIsHeld = (b: Pick<ResourceBooking, 'status'>): boolean => b.status === 'held';

export const bookingCovers = (b: Pick<ResourceBooking, 'from' | 'to'>, day: string): boolean =>
  day >= b.from && day <= b.to;

// -- Current feasibility: derived, never stored -----------------------------

export type BookingFeasibility = 'AVAILABLE' | 'CONFLICTED' | 'UNKNOWN';

export interface BookingAssessment {
  feasibility: BookingFeasibility;
  /** The days on which total committed demand exceeds a known capacity. */
  conflictDays: string[];
  /** In the domain's own words, whenever the answer is not a plain AVAILABLE. */
  reason?: string;
  /**
   * True when this was within capacity when committed and is not now.
   *
   * The temporal case, and the one a planner most needs named: nobody did anything wrong here, and
   * the resolution differs from the resolution for a booking that never fitted.
   */
  becameInfeasible: boolean;
}

/**
 * What is true about one day NOW.
 *
 * `committed` INCLUDES this booking — it is the total load on the resource that day across every
 * project. That is the opposite convention to `DayAvailability.alreadyCommitted`, so the fields
 * are named differently rather than sharing one type: the difference between them is one booking's
 * worth of demand, and silently reading one as the other flips a conflict into a clean bill.
 */
export interface DayLoad {
  day: string;
  /** `null` = UNKNOWN. Not zero, and not unlimited. */
  capacity: number | null;
  committed: number;
  /** The unit these numbers are in. `null` when nothing declares a capacity for that day. */
  unit: ResourceUnit | null;
}

/**
 * Assess a booking against today's facts.
 *
 * `days` is supplied by the caller — resolved capacity and total commitments, other projects'
 * included — so this stays a pure function, for the same reason the planner is one: a rule that
 * queries is a rule you cannot test at every edge.
 *
 * `calendar` is the working calendar (Step 8), also supplied as data. Only WORKING days are expected
 * to carry a load: a non-working day the caller did not resolve is not "unknown", it is a day nobody
 * works, and counting it as unknown would drag an otherwise clean booking to UNKNOWN over a weekend.
 * The default is every-day-working, so a caller that passes no calendar behaves exactly as before.
 *
 * A released booking is not assessed. It holds nothing, so it can conflict with nothing, and
 * reporting it would put a resolved problem back on a planner's screen.
 */
export function assessBooking(
  b: ResourceBooking,
  days: readonly DayLoad[],
  calendar: WorkingCalendar = ALL_DAYS_WORKING,
): BookingAssessment {
  if (b.status === 'released') {
    return { feasibility: 'AVAILABLE', conflictDays: [], becameInfeasible: false };
  }
  const covered = days.filter((d) => bookingCovers(b, d.day) && calendar.isWorkingDay(d.day));
  // Only working days are expected. A non-working day is not missing information — it is not worked.
  const expected = bookingDays(b.from, b.to).filter((d) => calendar.isWorkingDay(d));
  const missing = expected.filter((d) => !covered.some((c) => c.day === d));

  // Units that disagree are not a smaller number or a larger one; they are not comparable at all.
  // Adding 4 persons to 40 hours produces a figure that means nothing, and the gate forbids the
  // implicit conversion precisely here.
  const mismatched = covered.filter((d) => d.unit !== null && d.unit !== b.unit);
  if (mismatched.length > 0) {
    return {
      feasibility: 'UNKNOWN',
      conflictDays: [],
      becameInfeasible: false,
      reason: `capacity for this resource is measured in ${mismatched[0].unit} and this booking in ${b.unit}; the two cannot be compared.`,
    };
  }

  // A known capacity exceeded is a conflict wherever it happens, even when other days are unknown.
  // Answering UNKNOWN for a day we can see is over would hide a real clash behind a missing one.
  const conflictDays = covered.filter((d) => d.capacity !== null && d.committed > d.capacity).map((d) => d.day);
  if (conflictDays.length > 0) {
    const wasFine = wasValidAtCommitment(b) === true;
    return {
      feasibility: 'CONFLICTED',
      conflictDays,
      // The sentence a planner actually needs: was this always wrong, or did it become wrong?
      reason: wasFine
        ? `this booking fitted when it was committed and no longer does — committed demand exceeds capacity on ${conflictDays.length} day(s).`
        : `committed demand exceeds capacity on ${conflictDays.length} day(s).`,
      becameInfeasible: wasFine,
    };
  }

  const unknownDays = covered.filter((d) => d.capacity === null).length + missing.length;
  if (unknownDays > 0) {
    return {
      feasibility: 'UNKNOWN',
      conflictDays: [],
      becameInfeasible: false,
      reason: `capacity is unknown on ${unknownDays} of the days this booking covers.`,
    };
  }
  return { feasibility: 'AVAILABLE', conflictDays: [], becameInfeasible: false };
}
