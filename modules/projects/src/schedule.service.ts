import { Inject, Injectable, Logger, Optional, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, PG_POOL, AuditService } from '@aura/core';
import {
  clearActivityProgressOverride, overrideActivityProgress, resolveActivityProgress,
  type ActivityProgress,
} from './domain/activity-progress';
import { resolvePlannedOutput, type PlannedOutput } from './domain/planned-output';
import { resolveLookAhead, type LookAhead } from './domain/look-ahead';
import { compareRecovery, type RecoveryComparison } from './domain/recovery-proposal';
import { assessDelayImpact, type DelayImpact, type ConcurrentDelay } from './domain/delay-impact';
import { ActivityOutputService } from './activity-output.service';
import { ProjectCalendarService } from './project-calendar.service';
import { workingDaysInRange } from './domain/working-calendar';
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
  assertDurationFitsWindow,
  setScheduleDependencies,
} from './domain/schedule';
import type { NewScheduleDependency } from './domain/schedule-network';
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
  planningBasisFingerprint,
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
    // The immutable audit trail for the governed acts — run, accept, discard (Step 13). Optional for
    // the same reason every other seam is: it is a no-op (logs to memory) until Postgres is bound.
    @Optional() @Inject(AuditService) private readonly audit: AuditService | null = null,
    @Inject(WBS_STORE) private readonly wbs: WbsStore,
    // The owning service answers ONE question here — which packages are measured — and it is the
    // only place that rule is defined. Optional for the same reason every seam is: a composition
    // without it reports every activity's progress as DECLARED, which is what it then knows.
    @Optional() @Inject(WbsService) private readonly wbsService: WbsService | null = null,
    // What each work package was sold and priced for (PLN-11). Optional like every other seam: a
    // composition without it reports every activity's output as UNKNOWN, which is what it knows.
    @Optional() @Inject(ActivityOutputService) private readonly outputs: ActivityOutputService | null = null,
    // Which calendar this project's days are counted under — one answer, asked here by the save
    // check, the planning run and the output rates alike (PLN-03).
    @Optional() @Inject(ProjectCalendarService) private readonly projectCalendar: ProjectCalendarService | null = null,
  ) {}

  /** Create-or-replace the project's schedule (idempotent per project; keeps baseline). */
  async save(input: NewProjectSchedule): Promise<ProjectSchedule> {
    const existing = await this.store.getByProject(input.tenantId, input.projectId);
    const tasks = await this.resolveAuthoredTasks(input, existing);
    await this.assertDurationsFitTheirWindows(input.tenantId, input.projectId, tasks);
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
   * Refuse an activity whose authored work cannot fit the window it was given.
   *
   * Only answerable once the project names a calendar: "twelve working days" is not a fact about a
   * date range until somebody says which days are worked. Float in the other direction is fine and
   * expected — see assertDurationFitsWindow.
   */
  private async assertDurationsFitTheirWindows(tenantId: Id, projectId: Id, tasks: NewScheduleTask[]): Promise<void> {
    const dated = tasks.filter((task) => task.durationWorkingDays && task.plannedStart && task.plannedEnd);
    if (dated.length === 0 || !this.projectCalendar) return;
    const from = dated.reduce((min, task) => (task.plannedStart < min ? task.plannedStart : min), dated[0].plannedStart);
    const to = dated.reduce((max, task) => (task.plannedEnd > max ? task.plannedEnd : max), dated[0].plannedEnd);
    // One calendar resolution for the whole plan, not one per activity.
    const { calendar } = await this.projectCalendar.forProject(tenantId, projectId, { from, to });
    for (const task of dated) {
      assertDurationFitsWindow(
        { name: task.name, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, durationWorkingDays: task.durationWorkingDays ?? null },
        workingDaysInRange(task.plannedStart, task.plannedEnd, calendar).length,
      );
    }
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
  /**
   * What a delay did to this programme's completion date.
   *
   * DERIVED on every read, from the network and the calendar, by running the same CPM twice — once
   * as planned, once with the delay inserted. It changes as the programme changes, which is correct
   * and is why it is not stored: what a delay is doing to the plan TODAY is a different fact from
   * what somebody assessed and submitted last month, and both are shown.
   */
  async delayImpact(input: {
    tenantId: Id; projectId: Id; today: string;
    delay: { id: Id; claimedDays: number; startDate: string; endDate: string | null; affectedTaskIds: Id[] };
    otherDelays: ConcurrentDelay[];
  }): Promise<DelayImpact> {
    const schedule = await this.store.getByProject(input.tenantId, input.projectId);
    if (!schedule) throw new NotFoundException(`no schedule for project ${input.projectId}`);

    const horizon = this.horizonOf(schedule, input.today);
    const resolved = this.projectCalendar
      ? await this.projectCalendar.forProject(input.tenantId, input.projectId, horizon)
      : null;
    // The programme starts where its earliest activity does, exactly as a planning run reads it.
    const projectStart = schedule.tasks.reduce(
      (earliest, task) => (task.plannedStart < earliest ? task.plannedStart : earliest),
      schedule.tasks[0]?.plannedStart ?? input.today,
    );

    return assessDelayImpact({
      delay: input.delay,
      tasks: schedule.tasks.map((task) => ({
        id: task.id, name: task.name, durationWorkingDays: task.durationWorkingDays,
      })),
      dependencies: schedule.dependencies,
      projectStart,
      nonWorkingDays: resolved?.everyDayWorked ? undefined : resolved?.nonWorkingDays,
      otherDelays: input.otherDelays,
    });
  }

  /**
   * The next few weeks of this programme, read off the plan itself.
   *
   * DERIVED, and stored nowhere. A look-ahead kept as its own document disagrees with the programme
   * the first time anybody extends an activity, and the site meeting is then held against a plan
   * that no longer exists. Every date, dependency, requirement and measurement here is the one the
   * schedule already holds.
   *
   * Assembled in ONE pass per project — the plan, its calendar, its held commitments and its work
   * packages — rather than a query per activity.
   */
  async lookAhead(input: {
    tenantId: Id; projectId: Id; weeks: number; today: string;
    /**
     * Held commitments keyed by the requirement they satisfy, RESOLVED by the caller.
     *
     * Supplied rather than queried, exactly as `runPlanning` takes its capacity facts: current
     * feasibility is the booking service's answer to compute, and reaching for it from here would
     * put a second copy of that rule inside the schedule — or a dependency cycle, since the booking
     * service already reads this plan to derive a commitment's lineage.
     */
    commitments: Map<Id, { feasibility: 'AVAILABLE' | 'CONFLICTED' | 'UNKNOWN' }>;
  }): Promise<LookAhead> {
    const { tenantId, projectId, weeks, today, commitments } = input;
    const schedule = await this.store.getByProject(tenantId, projectId);
    if (!schedule) throw new NotFoundException(`no schedule for project ${projectId}`);

    const horizon = this.horizonOf(schedule, today);
    const [resolved, packages] = await Promise.all([
      this.projectCalendar?.forProject(tenantId, projectId, horizon) ?? Promise.resolve(null),
      this.outputs?.packageOutputs(tenantId, projectId) ?? Promise.resolve(new Map()),
    ]);

    return resolveLookAhead({
      today,
      weeks,
      calendar: resolved?.calendar,
      calendarName: resolved?.calendarName ?? null,
      everyDayWorked: resolved?.everyDayWorked ?? true,
      tasks: schedule.tasks,
      dependencies: schedule.dependencies,
      commitments,
      packages: new Map([...packages].map(([nodeId, facts]) => [nodeId, {
        plannedQuantity: facts.frozen?.soldQuantity ?? null,
        installedQuantity: facts.installedQuantity,
        unit: facts.frozen?.unit ?? null,
      }])),
    });
  }

  /**
   * Replace this project's dependency network.
   *
   * REPLACE, not append, and validated as a WHOLE: a cycle cannot be judged one edge at a time, so
   * an editor that added edges singly could walk a plan into a loop one legal-looking step at a
   * time. The caller sends the network it wants and is refused with the loop named.
   *
   * Refuses rather than repairs. An edge naming a task that is not in this schedule is not an
   * instruction to create one, and a cycle is not something to break by dropping an edge the author
   * did not choose — which of two activities waits for the other is a decision, not arithmetic.
   */
  async setDependencies(input: {
    tenantId: Id; projectId: Id; edges: NewScheduleDependency[]; actorId?: Id | null;
  }): Promise<ProjectSchedule> {
    const schedule = await this.store.getByProject(input.tenantId, input.projectId);
    if (!schedule) throw new NotFoundException(`no schedule for project ${input.projectId}`);

    let next: ProjectSchedule;
    try {
      next = setScheduleDependencies(schedule, input.edges);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'this dependency network is invalid');
    }
    await this.store.update(next);
    await this.events.append([
      makeEvent({
        type: SCHEDULE_EVENT.saved,
        tenantId: next.tenantId, companyId: next.companyId, actorId: input.actorId ?? null,
        aggregateType: 'projects.schedule', aggregateId: next.id,
        payload: { projectId: next.projectId, dependencies: next.dependencies.length },
      }),
    ]);
    this.logger.log(`Dependency network for project ${input.projectId}: ${next.dependencies.length} edge(s)`);
    return next;
  }

  /**
   * The calendar this plan's days are counted under, and the working window each activity has.
   *
   * Derived on the read like everything else: `windowWorkingDays` is what the dates mean under the
   * calendar, and `floatWorkingDays` is the difference between that and the work authored into the
   * activity. Float is a plan, not an error — an activity with ten days of work in a window holding
   * fourteen has four days of slack, and a look-ahead is built on exactly that.
   */
  async calendarOf(schedule: ProjectSchedule, today: string): Promise<{
    calendarId: Id | null;
    calendarName: string | null;
    everyDayWorked: boolean;
    activities: Record<Id, { windowWorkingDays: number; floatWorkingDays: number | null }>;
  }> {
    const horizon = this.horizonOf(schedule, today);
    const resolved = this.projectCalendar
      ? await this.projectCalendar.forProject(schedule.tenantId, schedule.projectId, horizon)
      : null;
    const calendar = resolved?.calendar;
    const activities: Record<Id, { windowWorkingDays: number; floatWorkingDays: number | null }> = {};
    for (const task of schedule.tasks) {
      const windowWorkingDays = workingDaysInRange(task.plannedStart, task.plannedEnd, calendar).length;
      activities[task.id] = {
        windowWorkingDays,
        floatWorkingDays: task.durationWorkingDays === null ? null : windowWorkingDays - task.durationWorkingDays,
      };
    }
    return {
      calendarId: resolved?.calendarId ?? null,
      calendarName: resolved?.calendarName ?? null,
      everyDayWorked: resolved?.everyDayWorked ?? true,
      activities,
    };
  }

  /** The dates a plan spans, widened to today so a calendar covers the elapsed part too. */
  private horizonOf(schedule: ProjectSchedule, today: string): { from: string; to: string } {
    if (schedule.tasks.length === 0) return { from: today, to: today };
    return {
      from: schedule.tasks.reduce((min, task) => (task.plannedStart < min ? task.plannedStart : min), schedule.tasks[0].plannedStart),
      to: schedule.tasks.reduce((max, task) => (task.plannedEnd > max ? task.plannedEnd : max), today),
    };
  }

  async outputOf(schedule: ProjectSchedule, today: string): Promise<Map<Id, PlannedOutput>> {
    const horizon = this.horizonOf(schedule, today);
    const [packages, spent, resolved] = await Promise.all([
      this.outputs ? this.outputs.packageOutputs(schedule.tenantId, schedule.projectId) : Promise.resolve(new Map()),
      this.outputs ? this.outputs.labourSpent(schedule.tenantId, schedule.projectId) : Promise.resolve(null),
      this.projectCalendar?.forProject(schedule.tenantId, schedule.projectId, horizon) ?? Promise.resolve(null),
    ]);
    return new Map(schedule.tasks.map((task) => {
      const facts = task.wbsNodeId ? packages.get(task.wbsNodeId) : undefined;
      return [task.id, resolvePlannedOutput({
        frozen: facts?.frozen ?? null,
        installedQuantity: facts?.installedQuantity ?? null,
        plannedStart: task.plannedStart,
        plannedEnd: task.plannedEnd,
        today,
        spent,
        wbsNodeId: task.wbsNodeId,
        calendar: resolved?.calendar,
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
   * The non-working days over the horizon, from the calendar THIS PROJECT names (PLN-03).
   *
   * Until migration 0324 this took the tenant's calendars ordered by name and used the first —
   * right by luck for a company with one, and a coin toss for a company running Dubai and Riyadh
   * crews, with nothing on any screen saying which calendar produced the dates. A project now names
   * its own, and a project that names none is planned with every day worked and told so, rather
   * than having one chosen on its behalf.
   */
  private async resolveCalendar(tenantId: Id, projectId: Id, interval: { from: string; to: string }): Promise<string[] | undefined> {
    if (this.projectCalendar) {
      const resolved = await this.projectCalendar.forProject(tenantId, projectId, interval);
      return resolved.everyDayWorked ? undefined : resolved.nonWorkingDays;
    }
    // No project-calendar service in this composition: every day is worked, exactly as before
    // Step 8. Never the old guess — the tenant's first calendar by name was a coin toss for any
    // company running more than one.
    return undefined;
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
    opts: {
      ranBy?: Id | null; projectStart?: string;
      /** Set by the explicit hand-off from a delay assessment — see `prepareRecovery`. */
      sourceDelayId?: Id | null; sourceAssessmentImpactDays?: number | null;
    } = {},
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
    const nonWorkingDays = await this.resolveCalendar(tenantId, projectId, interval);

    const solved = runPlanning(schedule, { projectStart, ...resolved, nonWorkingDays }, { ranBy: opts.ranBy ?? null });
    // What the solver actually consumed, fingerprinted now and checked at acceptance. The task set
    // alone is not the basis: a duration, a date, an edge or the calendar can move without it.
    const calendar = this.projectCalendar ? await this.projectCalendar.forProject(tenantId, projectId, interval) : null;
    const run: PlanningRun = {
      ...solved,
      sourceDelayId: opts.sourceDelayId ?? null,
      sourceAssessmentImpactDays: opts.sourceAssessmentImpactDays ?? null,
      basisFingerprint: planningBasisFingerprint({
        tasks: schedule.tasks,
        dependencies: schedule.dependencies,
        calendarId: calendar?.calendarId ?? null,
      }),
    };
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

  /**
   * Prepare a recovery for an assessed delay — the EXPLICIT hand-off from PLN-14.
   *
   * A scenario, not a programme. It runs the same solver over the same calendar and the same
   * dependency network, stores the proposal beside the plan, and changes not one stored date;
   * making it current is a separate governed act by somebody who holds the authority to move a
   * programme.
   *
   * The hand-off is deliberately EXPLICIT rather than automatic. A delay assessment that silently
   * launched a re-plan would produce a proposal nobody asked for against a programme nobody agreed
   * to move, and the planner who has to defend the recovery would not have chosen its starting
   * point. Somebody presses this.
   *
   * REFUSES an unassessed delay. A recovery prepared against a delay nobody has assessed has
   * nothing to be a recovery OF — the figure it would be read against does not exist yet.
   */
  async prepareRecovery(input: {
    tenantId: Id; projectId: Id; delay: { id: Id; projectId: Id; assessedImpactWorkingDays: number | null };
    ranBy?: Id | null;
  }): Promise<PlanningRunView> {
    if (input.delay.projectId !== input.projectId) {
      // Recovering one project's programme because of another's delay is not a hand-off; it is two
      // projects wired together by accident.
      throw new BadRequestException('this delay belongs to a different project');
    }
    if (input.delay.assessedImpactWorkingDays === null || input.delay.assessedImpactWorkingDays === undefined) {
      throw new BadRequestException('this delay has not been assessed, so there is nothing to prepare a recovery against');
    }
    return this.runPlanning(input.tenantId, input.projectId, {
      ranBy: input.ranBy,
      sourceDelayId: input.delay.id,
      // Frozen at the hand-off: a later re-assessment must not rewrite what this was prepared for.
      sourceAssessmentImpactDays: input.delay.assessedImpactWorkingDays,
    });
  }

  /**
   * What this proposal would recover against the programme as it stands.
   *
   * Derived on the read, and counted in working days under the project's calendar. The figure a
   * recovery is judged on is the COMPARISON, never the proposal's finish date alone.
   */
  async recoveryOf(tenantId: Id, runId: Id): Promise<RecoveryComparison> {
    const run = await this.loadRun(tenantId, runId);
    const schedule = await this.store.get(run.scheduleId);
    if (!schedule) throw new NotFoundException(`the schedule for run ${runId} no longer exists`);

    const currentFinish = schedule.tasks.length === 0 ? null : schedule.tasks.reduce(
      (latest, task) => (task.plannedEnd > latest ? task.plannedEnd : latest), schedule.tasks[0].plannedEnd);
    const interval = this.horizon(schedule, schedule.tasks[0]?.plannedStart ?? run.proposal.projectStart);
    const calendar = this.projectCalendar
      ? await this.projectCalendar.forProject(tenantId, schedule.projectId, interval)
      : null;

    return compareRecovery({
      currentFinish,
      proposedFinish: run.proposal.projectFinish,
      established: run.proposal.established,
      calendar: calendar?.calendar,
      sourceDelayId: run.sourceDelayId ?? null,
      sourceAssessmentImpactDays: run.sourceAssessmentImpactDays ?? null,
    });
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

    // The basis as it stands NOW, so a programme that moved under the proposal is caught even when
    // every task id still matches.
    const interval = this.horizon(schedule, schedule.tasks[0]?.plannedStart ?? new Date().toISOString().slice(0, 10));
    const calendar = this.projectCalendar
      ? await this.projectCalendar.forProject(tenantId, schedule.projectId, interval)
      : null;
    const accepted = acceptProposal(schedule, run, {
      ...decision,
      currentBasisFingerprint: planningBasisFingerprint({
        tasks: schedule.tasks,
        dependencies: schedule.dependencies,
        calendarId: calendar?.calendarId ?? null,
      }),
    });

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
