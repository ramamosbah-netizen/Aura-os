import { roundDecimal } from '@aura/shared';
import type { Id } from '@aura/shared';
import type { FrozenProductivityBasis } from './handover';
import {
  resolveLabourProductivity,
  type LabourProductivity,
  type ProjectLabourSpent,
} from './labour-productivity';
import { ALL_DAYS_WORKING, workingDaysInRange, type WorkingCalendar } from './working-calendar';

/**
 * §22 — the rate this work was priced at, against the rate it is actually going at.
 *
 * PLN-12 made an activity's progress a measured fact. This answers the question that only becomes
 * askable once it is: measured against WHAT? A bar at 75% is not late or early on its own. It is
 * late against a quantity somebody sold, a rate somebody priced, and dates somebody planned.
 *
 * Four facts, and they are four:
 *
 *   PLANNED QUANTITY   the frozen sold quantity of the work package's award line. Not retyped by a
 *                      planner, not inferred from the schedule — read from the handover evidence.
 *   PRICED RATE        how fast the work was priced to go, frozen with the award as crew size and
 *                      crew-hours per unit. It is what the company committed to, not a target
 *                      somebody set afterwards.
 *   INSTALLED          what site actually put in, measured through the Quantity Ledger.
 *   ELAPSED            how much of the activity's own planned window has been used.
 *
 * Everything below is DERIVED from those four on every read and stored nowhere. A stored verdict
 * ("behind") would be a verdict as of the last refresh — the same defect as a stored feasibility
 * or a copied progress figure.
 *
 * UNKNOWN IS NOT ZERO, and it is not "on rate" either. A package with no award line mapped to it,
 * an award captured before the rate was frozen, a fully subcontracted line that priced no crew, an
 * activity with no dates, a window that has not opened yet — each of those is a fact nobody has
 * stated, and every one of them returns UNKNOWN carrying the reason. Reporting an unpriced package
 * as "on rate" would be the system agreeing with a plan it cannot check.
 */

export type OutputVerdict = 'AHEAD' | 'ON_RATE' | 'BEHIND' | 'UNKNOWN';

export interface PlannedOutput {
  /** The frozen sold quantity of the award line behind this work package. */
  plannedQuantity: number | null;
  unit: string | null;
  /** Measured through the Quantity Ledger. `null` = the ledger cannot answer for this package. */
  installedQuantity: number | null;
  /** What was priced, exactly as frozen. Null where nobody priced a crew for this line. */
  basis: FrozenProductivityBasis | null;
  /** Units per 8-hour day the priced crew was committed to. */
  pricedRatePerDay: number | null;
  /** Crew-days the whole sold quantity was priced to take. */
  pricedCrewDays: number | null;
  /** Units per WORKING day achieved over the part of the window already used. */
  achievedRatePerDay: number | null;
  /** Units per day needed over what is left of the window to still finish it. */
  requiredRatePerDay: number | null;
  /** Quantity that should be in by now if the window were consumed at the priced rate. */
  expectedByNow: number | null;
  verdict: OutputVerdict;
  /** Why no verdict can be given. Null when there is one. */
  unknownReason: string | null;
  /**
   * What the installed work COST in hours, against what it was priced to cost.
   *
   * A separate question with its own verdict and its own unknowns, kept apart deliberately: a crew
   * can be behind the programme and perfectly efficient (too few people), or ahead of it and
   * ruinous (far too many). Folding the two into one "performance" number would hide exactly the
   * case a manager needs to see. See labour-productivity.ts.
   */
  labour: LabourProductivity;
}

type Pace = Omit<PlannedOutput, 'labour'>;

const UNKNOWN = (unknownReason: string, over: Partial<Pace> = {}): Pace => ({
  plannedQuantity: null, unit: null, installedQuantity: null, basis: null,
  pricedRatePerDay: null, pricedCrewDays: null, achievedRatePerDay: null,
  requiredRatePerDay: null, expectedByNow: null,
  verdict: 'UNKNOWN', unknownReason, ...over,
});

const HOURS_PER_DAY = 8;
/** Inside this band the achieved rate is the priced rate; measurement is not that precise. */
const ON_RATE_TOLERANCE = 0.05;

// Rates are quantities, not money — but the same decimal-safe rounding applies (G-10).
const r2 = (value: number): number => roundDecimal(value, 2);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * WORKING days from `from` to `to`, both ends counted.
 *
 * Counted under the project's calendar, not in raw calendar days. A rate divided by calendar days
 * charges a crew for the Friday they were never asked to work and for the week of Eid the company
 * closed — and it disagreed with the planning solver, which has counted working days since Step 8.
 * Two answers to "how long is this window" in one product is the defect; this is the single one.
 *
 * With no calendar the predicate says every day is worked, which is the caller's assertion and
 * gives exactly the old behaviour.
 */
const workingDays = (from: string, to: string, calendar: WorkingCalendar): number =>
  workingDaysInRange(from, to, calendar).length;

export interface PlannedOutputInput {
  /** What the project's day sheets say about where the hours went. Null = no source is bound. */
  spent?: ProjectLabourSpent | null;
  /** The work package this activity names, which is what recorded hours would have to name too. */
  wbsNodeId?: Id | null;
  /** The award line behind the work package: what was sold, in what unit, priced how. */
  frozen: { soldQuantity: number | null; unit: string | null; productivityBasis?: FrozenProductivityBasis | null } | null;
  /** Measured installed quantity for that line. `null` = the ledger cannot answer. */
  installedQuantity: number | null;
  /** The activity's own planned window. */
  plannedStart: string;
  plannedEnd: string;
  /** Today, as a date. Passed in rather than read, so the rule is testable at every edge. */
  today: string;
  /**
   * The project's working calendar. Omitted, every day counts as worked — the same assertion the
   * planner makes when no calendar is named, and the same behaviour as before calendars existed.
   */
  calendar?: WorkingCalendar;
}

/**
 * Resolve one activity's output against what was sold and priced.
 *
 * PURE, and takes every fact as data for the reason every rule in §22 does: a rule that queries is
 * a rule you cannot test at the edges, and the edges are where this one earns its keep — a window
 * that has not opened, a window already closed, a line nobody priced, a package nobody measured.
 */
export function resolvePlannedOutput(input: PlannedOutputInput): PlannedOutput {
  return {
    ...resolvePace(input),
    // The cost half, resolved from the same frozen basis and the same measurement — and answering
    // a different question, so it carries its own verdict and its own reason for having none.
    labour: resolveLabourProductivity({
      basis: input.frozen?.productivityBasis ?? null,
      installedQuantity: input.installedQuantity,
      spent: input.spent ?? null,
      wbsNodeId: input.wbsNodeId ?? null,
    }),
  };
}

/** The pace half: what was sold and priced, against what is in and how much time has gone. */
function resolvePace(input: PlannedOutputInput): Omit<PlannedOutput, 'labour'> {
  const { frozen, installedQuantity, plannedStart, plannedEnd, today } = input;

  if (!frozen) {
    return UNKNOWN('this activity’s work package carries no award line, so nothing was sold or priced for it');
  }
  const plannedQuantity = typeof frozen.soldQuantity === 'number' && Number.isFinite(frozen.soldQuantity) && frozen.soldQuantity > 0
    ? frozen.soldQuantity : null;
  const unit = frozen.unit ?? null;
  const basis = frozen.productivityBasis ?? null;
  const known: Partial<Pace> = { plannedQuantity, unit, installedQuantity, basis };

  if (plannedQuantity === null) {
    return UNKNOWN('the award line behind this work package carries no sold quantity', known);
  }

  // What was priced. A line with no crew (fully subcontracted, or supply-only) priced no rate —
  // which is not a rate of zero, and not a licence to call the work on time.
  const pricedRatePerDay = basis && basis.crewHoursPerUnit > 0 ? r2(HOURS_PER_DAY / basis.crewHoursPerUnit) : null;
  const pricedCrewDays = pricedRatePerDay ? r2(plannedQuantity / pricedRatePerDay) : null;
  const priced: Partial<Pace> = { ...known, pricedRatePerDay, pricedCrewDays };

  if (!DATE.test(plannedStart) || !DATE.test(plannedEnd) || plannedEnd < plannedStart) {
    return UNKNOWN('this activity has no usable planned window to measure a rate over', priced);
  }
  if (installedQuantity === null) {
    return UNKNOWN('nothing is measured against this activity’s work package, so no output rate can be derived', priced);
  }

  const calendar = input.calendar ?? ALL_DAYS_WORKING;
  const windowDays = workingDays(plannedStart, plannedEnd, calendar);
  const elapsedDays = Math.min(windowDays, today < plannedStart ? 0 : workingDays(plannedStart, today, calendar));
  const remainingDays = Math.max(0, windowDays - elapsedDays);
  const remainingQuantity = Math.max(0, plannedQuantity - installedQuantity);

  // Needed over what is left. Nothing left to install is not a demand of zero — it is finished.
  const requiredRatePerDay = remainingQuantity === 0 ? 0 : remainingDays > 0 ? r2(remainingQuantity / remainingDays) : null;

  if (windowDays === 0) {
    // Every day of the window is a non-working day — a shutdown, or an activity parked across a
    // holiday. No work was ever asked for, so no rate can be owed.
    return UNKNOWN('every day of this activity’s window is a non-working day under the project calendar', priced);
  }
  if (elapsedDays === 0) {
    return UNKNOWN('this activity’s planned window has not opened yet, so there is no elapsed time to rate it over', {
      ...priced, requiredRatePerDay,
    });
  }

  const achievedRatePerDay = r2(installedQuantity / elapsedDays);
  // What the plan's own window implies should be in by now, at the priced rate — capped at what
  // was actually sold, because a window cannot call for more than the scope.
  const expectedByNow = pricedRatePerDay === null
    ? r2(Math.min(plannedQuantity, (plannedQuantity / windowDays) * elapsedDays))
    : r2(Math.min(plannedQuantity, pricedRatePerDay * elapsedDays));
  const measured: Partial<Pace> = {
    ...priced, achievedRatePerDay, requiredRatePerDay, expectedByNow,
  };

  if (pricedRatePerDay === null) {
    // The window still says something, but it is the plan agreeing with itself — not evidence of
    // the rate the work was sold at, so it is not dressed up as one.
    return UNKNOWN('no crew was priced for this award line, so there is no committed rate to judge the achieved one against', measured);
  }

  const ratio = achievedRatePerDay / pricedRatePerDay;
  const verdict: OutputVerdict = Math.abs(ratio - 1) <= ON_RATE_TOLERANCE
    ? 'ON_RATE' : ratio > 1 ? 'AHEAD' : 'BEHIND';
  return { ...(measured as Pace), verdict, unknownReason: null };
}

/**
 * The priced basis of one award line, read from the estimate's resource sheet.
 *
 * The sheet's manpower blocks are PER LINE (`count` people × `hours` each, for the whole
 * quantity), so everything is normalised to one unit here — which is what makes the frozen basis
 * survive a later revision that sells a different quantity. No rate, no amount: see the type.
 */
export function productivityBasisFrom(
  resources: {
    technician?: { count?: number; hours?: number } | null;
    engineer?: { count?: number; hours?: number } | null;
    projectManager?: { count?: number; hours?: number } | null;
  } | null | undefined,
  lineQuantity: number,
  estimateId: string | null,
): FrozenProductivityBasis | null {
  if (!resources) return null;
  const quantity = Number(lineQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const manHours = (block: { count?: number; hours?: number } | null | undefined): number => {
    const count = Number(block?.count) || 0;
    const hours = Number(block?.hours) || 0;
    return count > 0 && hours > 0 ? count * hours : 0;
  };
  const crewSize = Math.max(0, Number(resources.technician?.count) || 0);
  const technicianManHours = manHours(resources.technician);
  const engineerManHours = manHours(resources.engineer);
  const projectManagerManHours = manHours(resources.projectManager);

  // Nothing priced at all is not a basis of zero — it is no basis, and callers must see the
  // difference between "priced to take no time" and "nobody priced it".
  if (crewSize === 0 && technicianManHours === 0 && engineerManHours === 0 && projectManagerManHours === 0) {
    return null;
  }

  const manHoursPerUnit = technicianManHours / quantity;
  return {
    crewSize,
    manHoursPerUnit: roundDecimal(manHoursPerUnit, 4),
    crewHoursPerUnit: crewSize > 0 ? roundDecimal(manHoursPerUnit / crewSize, 4) : 0,
    engineerManHoursPerUnit: roundDecimal(engineerManHours / quantity, 4),
    projectManagerManHoursPerUnit: roundDecimal(projectManagerManHours / quantity, 4),
    estimateId,
  };
}
