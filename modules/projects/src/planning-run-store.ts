import type { Id } from '@aura/shared';
import type { PlanningRun } from './domain/planning-run';

export const PLANNING_RUN_STORE = Symbol('PLANNING_RUN_STORE');

/**
 * §22 Step 9 (part 2) — persistence for planning runs and their proposals.
 *
 * A run is created `proposed` and its proposal never changes; only its STATUS and acceptance/discard
 * provenance transition (Step 10). So the contract is deliberately small: create a run, read one or
 * a schedule's worth, and update a run's status. Promoting a proposal to the current plan is a
 * cross-aggregate act and does not live here — see `persistAcceptedPlan` in the Postgres store.
 */
export interface PlanningRunStore {
  create(run: PlanningRun): Promise<void>;
  get(id: Id): Promise<PlanningRun | null>;
  /** A schedule's runs, newest first. */
  listForSchedule(tenantId: Id, scheduleId: Id): Promise<PlanningRun[]>;
  /** Transition a run's status and acceptance/discard provenance. The proposal is immutable. */
  update(run: PlanningRun): Promise<void>;
}
