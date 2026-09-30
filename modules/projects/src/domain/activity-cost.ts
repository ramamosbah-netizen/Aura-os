import type { Id } from '@aura/shared';
import type { WorkPackageActuals } from './cost-actuals';

/**
 * WHAT AN ACTIVITY'S WORK HAS COST SO FAR — the WBS identity continued into cost (F-07).
 *
 * The activity already carried its work package into demand (requirements → bookings) and into
 * progress (the package's installed quantity). Cost stopped short: every source posted to a CBS line
 * only, so a package's actual cost was zero whatever was spent on it. Now the sources that record a
 * package carry it into the Cost Ledger, and this is the planning view's read of that ledger.
 *
 * THE COST IS THE PACKAGE'S, NOT THE ACTIVITY'S. Cost is attributed to a work package, never to an
 * activity, so two activities on one package show the same figure — and say how many share it rather
 * than each claiming it as its own.
 *
 * UNKNOWN IS NOT ZERO. No ledger bound, or an activity with no package: `packageActual` is null. A
 * package with no stated budget: `packageBudget` is null. A package nobody has charged yet: 0, with
 * 0 postings — which is a fact, and differs from not knowing.
 *
 * DERIVED, never stored: a copy on the activity would be stale from the next posting.
 */
export interface ActivityCost {
  wbsNodeId: Id | null;
  /** Actual cost the Cost Ledger attributes to the work package. Null = cannot be read. */
  packageActual: number | null;
  packagePostings: number;
  /** The package's stated budget (planned value). Null = never stated — unknown, not zero. */
  packageBudget: number | null;
  /** Activities in this plan on the same package — its cost is theirs together. */
  sharedBy: number;
}

/** Cost the project has spent that no work package carries — reported once, beside every package figure. */
export interface ScheduleCostCoverage {
  /** The project's actual cost: every countable posting. Null = no ledger bound. */
  projectActual: number | null;
  unattributedActual: number | null;
  unattributedPostings: number;
  /** Postings the totals leave out because their base-currency amount is unknown. */
  unknownProvenance: number;
}

export function resolveActivityCosts(
  tasks: readonly { id: Id; wbsNodeId: Id | null }[],
  packages: readonly { id: Id; plannedValue: number; plannedValueKnown: boolean }[],
  actuals: WorkPackageActuals | null,
): { byTask: Map<Id, ActivityCost>; coverage: ScheduleCostCoverage } {
  const pkg = new Map(packages.map((node) => [node.id, node]));
  const sharing = new Map<Id, number>();
  for (const task of tasks) if (task.wbsNodeId) sharing.set(task.wbsNodeId, (sharing.get(task.wbsNodeId) ?? 0) + 1);

  const byTask = new Map<Id, ActivityCost>();
  for (const task of tasks) {
    const node = task.wbsNodeId ? pkg.get(task.wbsNodeId) : undefined;
    // An activity whose package is not one of this project's is not this project's package cost.
    const cell = node && actuals ? actuals.byPackage[node.id] ?? { amount: 0, postings: 0 } : null;
    byTask.set(task.id, {
      wbsNodeId: task.wbsNodeId,
      packageActual: cell ? cell.amount : null,
      packagePostings: cell ? cell.postings : 0,
      packageBudget: node && node.plannedValueKnown ? node.plannedValue : null,
      sharedBy: task.wbsNodeId ? sharing.get(task.wbsNodeId) ?? 1 : 0,
    });
  }
  return {
    byTask,
    coverage: actuals
      ? { projectActual: actuals.total, unattributedActual: actuals.unattributed.amount, unattributedPostings: actuals.unattributed.postings, unknownProvenance: actuals.unknownProvenance }
      : { projectActual: null, unattributedActual: null, unattributedPostings: 0, unknownProvenance: 0 },
  };
}
