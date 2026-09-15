import { Inject, Injectable, Logger, Optional, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, PG_POOL, AuditService, CalendarService } from '@aura/core';
import {
  clearActivityProgressOverride, overrideActivityProgress, resolveActivityProgress,
  type ActivityProgress,
} from './domain/activity-progress';
import { resolvePlannedOutput, type PlannedOutput } from './domain/planned-output';
import { ActivityOutputService } from './activity-output.service';
import {
  SCHEDULE_EVENT,
  type ProjectSchedule,
  type NewProjectSchedule,
  type NewScheduleTask,
  type ScheduleTask,
  type ScheduleSummary,
  makeProjectSchedule,
  setScheduleTasks,
  setBaseline,
  summariseSchedule,
} from './domain/schedule';
import { SCHEDULE_STORE, type ScheduleStore } from './schedule-store';
import { WbsService } from './wbs.service';
import { WBS_STORE, type WbsStore } from './wbs-store';
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
import { resolveNonWorkingDays } from './resource-calendar';

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
    // The immutable audit trail for the governed acts — run, accept, discard (Step 13). Optional for
    // the same reason every other seam is: it is a no-op (logs to memory) until Postgres is bound.
    @Optional() @Inject(AuditService) private readonly audit: AuditService | null = null,
    // The working calendar (Step 8). When bound and the tenant has a calendar, a planning run counts
    // working days rather than raw calendar days; absent, every day is worked (the prior behaviour).
    @Optional() @Inject(CalendarService) private readonly calendars: CalendarService | null = null,
    @Inject(WBS_STORE) private readonly wbs: WbsStore,
    // The owning service answers ONE question here — which packages are measured — and it is the
    // only place that rule is defined. Optional for the same reason every seam is: a composition
    // without it reports every activity's progress as DECLARED, which is what it then knows.
    @Optional() @Inject(WbsService) private readonly wbsService: WbsService | null = null,
    // What each work package was sold and priced for (PLN-11). Optional like every other seam: a
    // composition without it reports every activity's output as UNKNOWN, which is what it knows.
    @Optional() @Inject(ActivityOutputService) private readonly outputs: ActivityOutputService | null = null,
  ) {}

  /** Create-or-replace the project's schedule (idempotent per project; keeps baseline). */
  async save(input: NewProjectSchedule): Promise<ProjectSchedule> {
    const existing = await this.store.getByProject(input.tenantId, input.projectId);
    const tasks = await this.resolveAuthoredTasks(input, existing);
    let sch: ProjectSchedule;
    if (existing) {
      sch = setScheduleTasks(existing, tasks);
      // Saving REPLACES the activity list, so an activity or requirement left out of the payload is
      // deleted. The store translates the database's refusal (ON DELETE RESTRICT, migrations 0290
      // and 0316) into the domain message naming which of the two it was — one explanation, given
      // where the constraint actually fires.
      await this.store.update(sch);
    } else {
      sch = makeProjectSchedule({ ...input, tasks });
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

  /**
   * Resolve the fields a saver does not get to author, from what is already persisted.
   *
   * TWO of them, for the same reason: the payload is not the authority.
   *
   *   wbsNodeId          resolved from the persisted node, never from projectId alone. Existing
   *                      pre-0315 activities may remain unlinked until edited, but every new
   *                      activity must name a canonical node and an established link cannot be
   *                      removed or moved silently.
   *   progressOverride*  carried over from the persisted activity and IGNORED off the payload.
   *                      Saving a plan must not drop a statement somebody made against the
   *                      measurement — and equally must not be able to MINT one, which would put a
   *                      reason and a signature on a number nobody checked, through a route that
   *                      does not hold `projects.schedule.progress-override`. The write path is
   *                      `overrideProgress`, and it is the only one.
   */
  private async resolveAuthoredTasks(
    input: NewProjectSchedule,
    existing: ProjectSchedule | null,
  ): Promise<NewScheduleTask[]> {
    const prior = new Map((existing?.tasks ?? []).map((task) => [task.id, task]));
    const resolved: NewScheduleTask[] = [];
    for (const task of input.tasks ?? []) {
      const persisted = task.id ? prior.get(task.id) : undefined;
      let wbsNodeId = task.wbsNodeId;

      if (persisted?.wbsNodeId) {
        if (wbsNodeId !== undefined && wbsNodeId !== persisted.wbsNodeId) {
          throw new BadRequestException(`activity ${task.id} is already linked to WBS node ${persisted.wbsNodeId}`);
        }
        wbsNodeId = persisted.wbsNodeId;
      }

      const isNew = !persisted;
      if (isNew && !wbsNodeId) {
        throw new BadRequestException('wbsNodeId is required for every new schedule activity');
      }

      if (wbsNodeId) {
        const node = await this.wbs.get(wbsNodeId);
        if (!node || node.tenantId !== input.tenantId || node.projectId !== input.projectId) {
          throw new BadRequestException(`WBS node ${wbsNodeId} does not belong to project ${input.projectId}`);
        }
      }
      resolved.push({
        ...task,
        wbsNodeId: wbsNodeId ?? null,
        // Whatever the payload said about the override, the persisted activity is the answer.
        // A new activity has no measurement behind it yet, so it has nothing to override.
        progressOverride: persisted?.progressOverride ?? null,
        progressOverrideReason: persisted?.progressOverrideReason ?? null,
        progressOverrideAt: persisted?.progressOverrideAt ?? null,
        progressOverrideBy: persisted?.progressOverrideBy ?? null,
      });
    }
    return resolved;
  }

  /**
   * The progress of every activity in a plan, resolved from the evidence behind it.
   *
   * ONE read of the project's work packages for the whole plan, not one per activity: a schedule
   * of forty activities is one query, and the alternative is how a Gantt becomes slow enough that
   * people stop opening it.
   *
   * The result is DERIVED and returned beside the plan rather than written into it. Storing it
   * would put a second copy of the Quantity Ledger's answer on the activity, stale from the moment
   * the next installation is approved.
   */
  async progressOf(schedule: ProjectSchedule): Promise<Map<Id, ActivityProgress>> {
    const linked = [...new Set(schedule.tasks.map((task) => task.wbsNodeId).filter((id): id is Id => !!id))];
    // Which packages are measured at all: one read for the project, not one per activity.
    const measured = this.wbsService
      ? await this.wbsService.measuredProgressNodes(schedule.tenantId, schedule.projectId)
      : new Set<Id>();
    const evidence = new Map<Id, number | null>();
    await Promise.all(linked.map(async (nodeId) => {
      if (!measured.has(nodeId)) return evidence.set(nodeId, null);
      const node = await this.wbs.get(nodeId);
      // Another tenant's node is not this plan's evidence, and a missing one is not zero progress.
      evidence.set(nodeId, node && node.tenantId === schedule.tenantId ? node.progress : null);
    }));
    return new Map(schedule.tasks.map((task) => [
      task.id,
      resolveActivityProgress(task, task.wbsNodeId ? evidence.get(task.wbsNodeId) ?? null : null),
    ]));
  }

  /**
   * Every activity's output against what its work package was SOLD and PRICED for.
   *
   * Derived on the read, exactly like `progressOf`, and batched for the same reason: one map,
   * project and ledger read for the whole plan rather than a chain per activity.
   *
   * `today` is passed in rather than read from the clock so the rule stays testable at the edges
   * of a planned window — the day it opens, the day it closes, and the days either side.
   */
  async outputOf(schedule: ProjectSchedule, today: string): Promise<Map<Id, PlannedOutput>> {
    const packages = this.outputs
      ? await this.outputs.packageOutputs(schedule.tenantId, schedule.projectId)
      : new Map();
    return new Map(schedule.tasks.map((task) => {
      const facts = task.wbsNodeId ? packages.get(task.wbsNodeId) : undefined;
      return [task.id, resolvePlannedOutput({
        frozen: facts?.frozen ?? null,
        installedQuantity: facts?.installedQuantity ?? null,
        plannedStart: task.plannedStart,
        plannedEnd: task.plannedEnd,
        today,
      })];
    }));
  }

  /**
   * State a figure against the measurement, or withdraw the statement.
   *
   * Its own write path, and not part of saving a plan, for two reasons: it needs a reason and a
   * name, and it needs its own permission — authoring a schedule and claiming progress the site
   * has not measured are different acts by different people.
   */
  async overrideProgress(input: {
    tenantId: Id; projectId: Id; taskId: Id;
    value: number | null; reason?: string; actorId?: Id | null;
  }): Promise<{ task: ScheduleTask; progress: ActivityProgress }> {
    const schedule = await this.store.getByProject(input.tenantId, input.projectId);
    if (!schedule) throw new NotFoundException(`no schedule for project ${input.projectId}`);
    const task = schedule.tasks.find((candidate) => candidate.id === input.taskId);
    if (!task) throw new NotFoundException('activity not found in this project schedule');

    const progress = (await this.progressOf(schedule)).get(task.id)!;
    let updated: ScheduleTask;
    try {
      updated = input.value === null
        ? clearActivityProgressOverride(task)
        : overrideActivityProgress(task, { value: input.value, reason: input.reason ?? '', actorId: input.actorId }, progress.evidence);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'this progress statement is invalid');
    }

    const next = setScheduleTasks(schedule, schedule.tasks.map((candidate) => candidate.id === task.id ? updated : candidate));
    await this.store.update(next);
    return { task: updated, progress: resolveActivityProgress(updated, progress.evidence) };
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
   * The non-working days over the horizon, from the tenant's working calendar (Step 8).
   *
   * The tenant's calendar is used (its first, by name) until a per-project calendar ASSIGNMENT
   * exists — a deliberate, documented interim: one calendar is the common ELV case, and it is far
   * better than planning through Fridays and Eid. With no calendar service or no calendar, the result
   * is `undefined` and the planner treats every day as worked, exactly as before.
   */
  private async resolveCalendar(tenantId: Id, interval: { from: string; to: string }): Promise<string[] | undefined> {
    if (!this.calendars) return undefined;
    const calendars = await this.calendars.listCalendars(tenantId);
    if (calendars.length === 0) return undefined;
    return resolveNonWorkingDays(this.calendars, calendars[0].id, interval);
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
    const nonWorkingDays = await this.resolveCalendar(tenantId, interval);

    const run = runPlanning(schedule, { projectStart, ...resolved, nonWorkingDays }, { ranBy: opts.ranBy ?? null });
    await this.runs.create(run);
    await this.events.append([
      makeEvent({
        type: SCHEDULE_EVENT.planningRan,
        tenantId, companyId: schedule.companyId, actorId: opts.ranBy ?? null,
        aggregateType: 'projects.schedule', aggregateId: schedule.id,
        payload: { projectId, runId: run.id, feasibility: run.proposal.feasibility, coverage: run.proposal.coverage },
      }),
    ]);
    await this.audit?.log(
      tenantId, schedule.companyId, opts.ranBy ?? null, 'projects', 'planning_run', run.id, 'ran',
      { feasibility: run.proposal.feasibility, coverage: run.proposal.coverage, established: run.proposal.established },
      { projectId, scheduleId: schedule.id, source: 'projects.schedule.planning_ran' },
    );
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
    await this.audit?.log(
      tenantId, schedule.companyId, decision.acceptedBy ?? null, 'projects', 'planning_run', runId, 'accepted',
      { established: run.proposal.established, acknowledgeReason: accepted.run.acceptanceReason },
      { projectId: schedule.projectId, scheduleId: schedule.id, source: 'projects.schedule.proposal_accepted' },
    );
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
    await this.audit?.log(
      tenantId, null, null, 'projects', 'planning_run', runId, 'discarded',
      { reason: discarded.discardedReason },
      { projectId: run.projectId, scheduleId: run.scheduleId, source: 'projects.schedule.proposal_discarded' },
    );
    return discarded;
  }

  private async loadRun(tenantId: Id, runId: Id): Promise<PlanningRun> {
    const run = await this.runs.get(runId);
    // RLS scopes the Postgres store; this guards the in-memory store and states the intent either way.
    if (!run || run.tenantId !== tenantId) throw new NotFoundException(`planning run ${runId} not found`);
    return run;
  }
}
