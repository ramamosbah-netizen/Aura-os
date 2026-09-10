import { Inject, Injectable, Logger, Optional, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, PG_POOL } from '@aura/core';
import {
  SCHEDULE_EVENT,
  type ProjectSchedule,
  type NewProjectSchedule,
  type NewScheduleTask,
  type ScheduleSummary,
  makeProjectSchedule,
  setScheduleTasks,
  setBaseline,
  summariseSchedule,
} from './domain/schedule';
import { SCHEDULE_STORE, type ScheduleStore } from './schedule-store';
import { type PlanInput, type SchedulePlan, planSchedule } from './domain/schedule-planning';
import type { ResourceRef } from './domain/resource-ref';
import { resolvePlanFacts, dedupeRefs } from './domain/resource-facts';
import {
  type PlanningRun,
  type ProposalComparison,
  runPlanning,
  compareProposalToCurrent,
} from './domain/planning-run';
import { type AcceptanceDecision, acceptProposal, discardProposal } from './domain/planning-acceptance';
import { RESOURCE_FACTS_STORE, type ResourceFactsStore } from './resource-facts-store';
import { PLANNING_RUN_STORE, type PlanningRunStore } from './planning-run-store';
import { persistAcceptedPlan } from './postgres-planning-run-store';

/** A planning run paired with what accepting it would change against the current plan. */
export interface PlanningRunView {
  run: PlanningRun;
  comparison: ProposalComparison;
}

/** Project schedule (Gantt) service — one per project; owns `aura_projects_schedules`. */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger('ProjectSchedule');

  constructor(
    @Inject(SCHEDULE_STORE) private readonly store: ScheduleStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(RESOURCE_FACTS_STORE) private readonly facts: ResourceFactsStore,
    @Inject(PLANNING_RUN_STORE) private readonly runs: PlanningRunStore,
    // Present in Postgres mode; when bound, acceptance persists atomically via `persistAcceptedPlan`.
    // Absent in in-memory/dev mode, where the store updates are applied sequentially.
    @Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null,
  ) {}

  /** Create-or-replace the project's schedule (idempotent per project; keeps baseline). */
  async save(input: NewProjectSchedule): Promise<ProjectSchedule> {
    const existing = await this.store.getByProject(input.tenantId, input.projectId);
    let sch: ProjectSchedule;
    if (existing) {
      sch = setScheduleTasks(existing, input.tasks ?? []);
      await this.store.update(sch);
    } else {
      sch = makeProjectSchedule(input);
      await this.store.create(sch);
    }
    await this.events.append([
      makeEvent({
        type: SCHEDULE_EVENT.saved,
        tenantId: sch.tenantId, companyId: sch.companyId, actorId: sch.createdBy,
        aggregateType: 'projects.schedule', aggregateId: sch.id,
        payload: { projectId: sch.projectId, tasks: sch.tasks.length },
      }),
    ]);
    return sch;
  }

  async setBaseline(tenantId: Id, projectId: Id): Promise<ProjectSchedule> {
    const sch = await this.store.getByProject(tenantId, projectId);
    if (!sch) throw new Error(`no schedule for project ${projectId}`);
    if (sch.tasks.length === 0) throw new Error('cannot baseline an empty schedule');
    const updated = setBaseline(sch);
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: SCHEDULE_EVENT.baselineSet,
        tenantId, companyId: sch.companyId, actorId: null,
        aggregateType: 'projects.schedule', aggregateId: sch.id,
        payload: { projectId, baselineSetAt: updated.baselineSetAt },
      }),
    ]);
    this.logger.log(`Baseline set for project ${projectId} (${updated.tasks.length} tasks)`);
    return updated;
  }

  async summary(tenantId: Id, projectId: Id): Promise<ScheduleSummary | null> {
    const sch = await this.store.getByProject(tenantId, projectId);
    return sch ? summariseSchedule(sch) : null;
  }

  list(tenantId: Id): Promise<ProjectSchedule[]> {
    return this.store.list(tenantId);
  }

  /**
   * Compute a resource-levelled, dependency-driven plan (CPM forward pass + levelling).
   *
   * Stateless by design, and stateless in the strong sense the §22 gate requires: the engine is
   * handed RESOLVED facts — capacities, other projects' commitments, non-working days — and never
   * queries for them. A Capacity/Availability Resolver will supply them; until it exists, the
   * caller does, and an unsupplied capacity is reported as UNKNOWN rather than as available.
   *
   * The result is a PROPOSAL. It does not touch the stored schedule, and accepting it is a
   * separate, governed act (DG-22.4).
   */
  plan(input: PlanInput): SchedulePlan {
    return planSchedule(input);
  }

  // ── §22 Step 11 — the governed planning chain, wired to the resolver and persisted ──────────

  /** Every typed resource a schedule's tasks require, without repeats. */
  private refsOf(schedule: ProjectSchedule): ResourceRef[] {
    return dedupeRefs(schedule.tasks.flatMap((t) => t.requirements.map((r) => r.resource)));
  }

  /** The horizon to resolve facts over: the project's authored span. */
  private horizon(schedule: ProjectSchedule, projectStart: string): { from: string; to: string } {
    const to = schedule.tasks.reduce((mx, t) => (t.plannedEnd > mx ? t.plannedEnd : mx), projectStart);
    return { from: projectStart, to };
  }

  /**
   * Run the solver for a project and persist the result as a PROPOSAL (DG-22.4).
   *
   * The facts are RESOLVED here, not queried by the engine: capacity windows and every OTHER
   * project's held bookings come from the cross-project store (Step 7), collapsed to the planner's
   * inputs. The run changes no stored date; it returns the proposal and what accepting it would move.
   */
  async runPlanning(
    tenantId: Id,
    projectId: Id,
    opts: { ranBy?: Id | null; projectStart?: string } = {},
  ): Promise<PlanningRunView> {
    const schedule = await this.store.getByProject(tenantId, projectId);
    if (!schedule) throw new NotFoundException(`no schedule for project ${projectId}`);
    if (schedule.tasks.length === 0) throw new BadRequestException('cannot plan an empty schedule');

    const projectStart =
      opts.projectStart ??
      schedule.tasks.reduce<string>((min, t) => (t.plannedStart < min ? t.plannedStart : min), schedule.tasks[0].plannedStart);
    const refs = this.refsOf(schedule);
    const interval = this.horizon(schedule, projectStart);
    const [windows, bookings] = await Promise.all([
      this.facts.capacityWindowsFor(tenantId, refs, interval),
      this.facts.heldBookingsFor(tenantId, refs, interval),
    ]);
    const resolved = resolvePlanFacts(projectId, refs, windows, bookings, interval);

    const run = runPlanning(schedule, { projectStart, ...resolved }, { ranBy: opts.ranBy ?? null });
    await this.runs.create(run);
    await this.events.append([
      makeEvent({
        type: SCHEDULE_EVENT.planningRan,
        tenantId, companyId: schedule.companyId, actorId: opts.ranBy ?? null,
        aggregateType: 'projects.schedule', aggregateId: schedule.id,
        payload: { projectId, runId: run.id, feasibility: run.proposal.feasibility, coverage: run.proposal.coverage },
      }),
    ]);
    return { run, comparison: compareProposalToCurrent(schedule, run.proposal) };
  }

  listRuns(tenantId: Id, projectId: Id): Promise<PlanningRun[]> {
    return this.store.getByProject(tenantId, projectId).then((s) =>
      s ? this.runs.listForSchedule(tenantId, s.id) : [],
    );
  }

  /** A run and the change accepting it would make to the CURRENT plan. */
  async getRun(tenantId: Id, runId: Id): Promise<PlanningRunView> {
    const run = await this.loadRun(tenantId, runId);
    const schedule = await this.store.get(run.scheduleId);
    if (!schedule) throw new NotFoundException(`the schedule for run ${runId} no longer exists`);
    return { run, comparison: compareProposalToCurrent(schedule, run.proposal) };
  }

  /** Promote a proposal to the current plan — the governed act (DG-22.4). */
  async acceptRun(
    tenantId: Id,
    runId: Id,
    decision: AcceptanceDecision = {},
  ): Promise<{ schedule: ProjectSchedule; run: PlanningRun }> {
    const run = await this.loadRun(tenantId, runId);
    const schedule = await this.store.get(run.scheduleId);
    if (!schedule) throw new NotFoundException(`the schedule for run ${runId} no longer exists`);

    const accepted = acceptProposal(schedule, run, decision);

    if (this.pool) {
      // One transaction: task dates updated in place, run accepted, siblings superseded.
      await persistAcceptedPlan(this.pool, accepted);
    } else {
      await this.store.update(accepted.schedule);
      await this.runs.update(accepted.run);
      for (const sibling of await this.runs.listForSchedule(tenantId, accepted.schedule.id)) {
        if (sibling.id !== accepted.run.id && sibling.status === 'proposed') {
          await this.runs.update({ ...sibling, status: 'superseded' });
        }
      }
    }

    await this.events.append([
      makeEvent({
        type: SCHEDULE_EVENT.proposalAccepted,
        tenantId, companyId: schedule.companyId, actorId: decision.acceptedBy ?? null,
        aggregateType: 'projects.schedule', aggregateId: schedule.id,
        payload: {
          projectId: schedule.projectId, runId,
          established: run.proposal.established,
          acknowledged: accepted.run.acceptanceReason !== null,
        },
      }),
    ]);
    this.logger.log(`Proposal ${runId} accepted for project ${schedule.projectId}`);
    return { schedule: accepted.schedule, run: accepted.run };
  }

  /** Reject a proposal outright. */
  async discardRun(tenantId: Id, runId: Id, reason: string): Promise<PlanningRun> {
    const run = await this.loadRun(tenantId, runId);
    const discarded = discardProposal(run, { reason });
    await this.runs.update(discarded);
    await this.events.append([
      makeEvent({
        type: SCHEDULE_EVENT.proposalDiscarded,
        tenantId, companyId: null, actorId: null,
        aggregateType: 'projects.schedule', aggregateId: run.scheduleId,
        payload: { runId, reason: discarded.discardedReason },
      }),
    ]);
    return discarded;
  }

  private async loadRun(tenantId: Id, runId: Id): Promise<PlanningRun> {
    const run = await this.runs.get(runId);
    // RLS scopes the Postgres store; this guards the in-memory store and states the intent either way.
    if (!run || run.tenantId !== tenantId) throw new NotFoundException(`planning run ${runId} not found`);
    return run;
  }
}
