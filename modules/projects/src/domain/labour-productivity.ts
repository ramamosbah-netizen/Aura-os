import { roundDecimal } from '@aura/shared';
import type { Id } from '@aura/shared';
import type { FrozenProductivityBasis } from './handover';

/**
 * §22 — did the work cost the hours it was priced to cost?
 *
 * PLN-11 answered the first half of productivity: the pace. A crew installing 6 m² a day against
 * 16 priced is losing ground, and that is knowable from quantities and dates alone. It does not
 * say whether those 6 metres took the priced hours or three times them — a crew can be behind the
 * programme and perfectly efficient (too few people), or ahead of it and ruinous (far too many).
 *
 * Three quantities of hours, and they are three:
 *
 *   PRICED    hours per unit, frozen with the award. What the company committed to.
 *   EARNED    priced hours × the quantity actually installed. What the work SHOULD have taken.
 *   SPENT     man-hours recorded against this work package by the people who were there.
 *
 * The factor is EARNED ÷ SPENT. Above 1 the work is beating the rate it was sold at; below 1 it is
 * costing more hours than were priced into it.
 *
 * THE UNATTRIBUTED REMAINDER IS PART OF THE ANSWER, not a footnote. Labour is recorded by a foreman
 * filling in a day sheet, and a great deal of a day genuinely belongs to no single package —
 * mobilisation, standing time, a crew moving between three risers. Those hours are real and they
 * are not in `spent`. A package credited with 40 of a project's 500 man-hours will show a superb
 * factor until somebody is told about the other 460, so the share that names no package travels
 * WITH the figure everywhere it goes. A productivity number that hides how much of the labour it
 * ignored is not a measurement; it is an advertisement.
 *
 * UNKNOWN IS NOT ONE. No hours attributed at all does not mean infinite productivity — it means
 * nobody wrote down where the time went, and the honest answer is that we do not know.
 */

export type LabourVerdict = 'BETTER_THAN_PRICED' | 'AS_PRICED' | 'WORSE_THAN_PRICED' | 'UNKNOWN';

export interface LabourProductivity {
  /** Man-hours recorded against this work package. `null` = nobody can say. */
  spentManHours: number | null;
  /** Man-hours the installed quantity was priced to take. */
  earnedManHours: number | null;
  /** earned ÷ spent. Above 1 beats the priced rate. */
  factor: number | null;
  /** Man-hours on this project attributed to no work package at all. */
  unattributedManHours: number | null;
  /** That remainder as a share of everything recorded on the project, 0..1. */
  unattributedShare: number | null;
  verdict: LabourVerdict;
  unknownReason: string | null;
}

/** What the people who were there wrote down, for one project. */
export interface ProjectLabourSpent {
  /** Man-hours recorded against each work package, keyed by WBS node id. */
  byWorkPackage: Map<Id, number>;
  /** Man-hours on this project naming no work package at all. */
  unattributedManHours: number;
  /** Everything recorded on the project, attributed or not. */
  totalManHours: number;
}

/**
 * Reads recorded labour from the module that owns it, bound at the composition root.
 *
 * A PORT, for the same reason the availability one is: Projects may not import Site (ADR-0004).
 * The implementation lives at the app layer where Site is already known, and this stays a pure
 * question with a data answer.
 *
 * UNBOUND IS A REAL STATE. A composition without Site reports every package's productivity as
 * UNKNOWN — which is exactly what it knows — and the pace half of PLN-11 is unaffected.
 */
export const LABOUR_SPENT_PROVIDER = Symbol('LABOUR_SPENT_PROVIDER');

export interface LabourSpentProvider {
  spentOn(tenantId: Id, projectId: Id): Promise<ProjectLabourSpent>;
}

/** Inside this band the work cost what it was priced to cost; day sheets are not more precise. */
const AS_PRICED_TOLERANCE = 0.1;

const UNKNOWN = (unknownReason: string, over: Partial<LabourProductivity> = {}): LabourProductivity => ({
  spentManHours: null, earnedManHours: null, factor: null,
  unattributedManHours: null, unattributedShare: null,
  verdict: 'UNKNOWN', unknownReason, ...over,
});

export interface LabourProductivityInput {
  /** The rate frozen with the award. Null where no crew was priced for the line. */
  basis: FrozenProductivityBasis | null;
  /** Quantity measured through the Quantity Ledger. Null = the ledger cannot answer. */
  installedQuantity: number | null;
  /** What the project's day sheets say. Null = no labour source is bound at all. */
  spent: ProjectLabourSpent | null;
  /** The work package these hours would have to name. */
  wbsNodeId: Id | null;
}

/**
 * Resolve what the installed work actually cost in hours, against what it was priced to cost.
 *
 * PURE, and takes every fact as data: the edges are where this earns its keep — nothing priced,
 * nothing installed, nothing attributed, and everything attributed but to other packages.
 */
export function resolveLabourProductivity(input: LabourProductivityInput): LabourProductivity {
  const { basis, installedQuantity, spent, wbsNodeId } = input;

  // The remainder is knowable even when the factor is not, and it is reported either way: a reader
  // deciding whether to trust ANY of this project's productivity figures needs it first.
  const remainder = spent
    ? {
        unattributedManHours: roundDecimal(spent.unattributedManHours, 2),
        unattributedShare: spent.totalManHours > 0
          ? roundDecimal(spent.unattributedManHours / spent.totalManHours, 4)
          : null,
      }
    : {};

  if (!spent) return UNKNOWN('no labour records are available to this plan');
  if (!basis || basis.manHoursPerUnit <= 0) {
    return UNKNOWN('no crew was priced for this award line, so there are no priced hours to compare against', remainder);
  }
  if (installedQuantity === null) {
    return UNKNOWN('nothing is measured against this work package, so no hours have been earned yet', remainder);
  }

  const spentManHours = roundDecimal(wbsNodeId ? spent.byWorkPackage.get(wbsNodeId) ?? 0 : 0, 2);
  const earnedManHours = roundDecimal(basis.manHoursPerUnit * installedQuantity, 2);

  if (spentManHours <= 0) {
    // NOT infinitely productive. Nobody wrote down where the time went.
    return UNKNOWN('no labour has been attributed to this work package, so what it cost in hours is unrecorded', {
      ...remainder, earnedManHours, spentManHours: 0,
    });
  }
  if (earnedManHours <= 0) {
    return UNKNOWN('nothing has been installed yet, so no hours have been earned to set against the hours spent', {
      ...remainder, earnedManHours, spentManHours,
    });
  }

  const factor = roundDecimal(earnedManHours / spentManHours, 2);
  const verdict: LabourVerdict = Math.abs(factor - 1) <= AS_PRICED_TOLERANCE
    ? 'AS_PRICED' : factor > 1 ? 'BETTER_THAN_PRICED' : 'WORSE_THAN_PRICED';
  return { ...remainder, spentManHours, earnedManHours, factor, verdict, unknownReason: null } as LabourProductivity;
}
