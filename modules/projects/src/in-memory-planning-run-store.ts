import type { Id } from '@aura/shared';
import type { PlanningRun } from './domain/planning-run';
import type { PlanningRunStore } from './planning-run-store';

/** In-memory {@link PlanningRunStore} — the no-database implementation for tests and dev boot. */
export class InMemoryPlanningRunStore implements PlanningRunStore {
  private readonly runs = new Map<string, PlanningRun>();

  async create(run: PlanningRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async get(id: Id): Promise<PlanningRun | null> {
    const r = this.runs.get(id);
    return r ? structuredClone(r) : null;
  }

  async listForSchedule(tenantId: Id, scheduleId: Id): Promise<PlanningRun[]> {
    return [...this.runs.values()]
      .filter((r) => r.tenantId === tenantId && r.scheduleId === scheduleId)
      .sort((a, b) => (a.ranAt < b.ranAt ? 1 : a.ranAt > b.ranAt ? -1 : 0))
      .map((r) => structuredClone(r));
  }

  async update(run: PlanningRun): Promise<void> {
    if (!this.runs.has(run.id)) throw new Error(`planning run ${run.id} not found`);
    this.runs.set(run.id, structuredClone(run));
  }
}
