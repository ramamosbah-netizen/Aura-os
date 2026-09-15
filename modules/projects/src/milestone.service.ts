import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  achieveMilestone,
  clearMilestoneAchievement,
  makeProjectMilestone,
  resolveMilestone,
  MILESTONE_EVENT,
  type GatingActivity,
  type MilestoneView,
  type ProjectMilestone,
} from './domain/milestone';
import { MILESTONE_STORE, type MilestoneStore } from './milestone-store';
import { SCHEDULE_STORE, type ScheduleStore } from './schedule-store';
import { ScheduleService } from './schedule.service';
import { ProjectCalendarService } from './project-calendar.service';
import { ProjectResponsibilityService } from './project-responsibility.service';

/**
 * Milestones — the points in a programme where something must be TRUE (PLN-04).
 *
 * The date a milestone is judged on is read out of the SCHEDULE'S OWN forecast run, never from a
 * second pass of the planner. Two CPM runs over one plan would eventually disagree, and a project
 * that answers "when does this finish" differently on two screens has no answer at all. That is why
 * this service asks `ScheduleService.forecast` rather than reaching for the solver itself.
 */
@Injectable()
export class MilestoneService {
  private readonly logger = new Logger('ProjectMilestone');

  constructor(
    @Inject(MILESTONE_STORE) private readonly store: MilestoneStore,
    @Inject(SCHEDULE_STORE) private readonly schedules: ScheduleStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly schedule: ScheduleService,
    /**
     * The owner's receipt goes through the SAME inbox every other project assignment uses (AWD-06),
     * rather than a second one built for milestones. Optional like every seam: unbound, a milestone
     * still records its owner and only the My Work item is unavailable — which such a composition
     * then says, rather than pretending nobody was told.
     *
     * `@Inject` is NOT decoration here and must not be dropped: a parameter typed `X | null` emits
     * `Object` as its design-time type, so Nest has no token to resolve and injects nothing at all.
     * Without it this reads as an unbound seam in every composition, and the receipt silently never
     * happens — which is exactly what it did until the handoff proof caught it.
     */
    @Optional() @Inject(ProjectResponsibilityService) private readonly responsibilities: ProjectResponsibilityService | null = null,
    /**
     * Which days this project counts (PLN-03). A milestone's variance must be counted the same way
     * the forecast's is, or "four days late" means two different things on one screen.
     */
    @Optional() @Inject(ProjectCalendarService) private readonly calendars: ProjectCalendarService | null = null,
  ) {}

  /**
   * Author a milestone against a project's programme.
   *
   * Every gating activity is resolved from the PERSISTED schedule, never trusted off the payload:
   * a milestone gating another project's activity would be two projects wired together by accident,
   * and one gating an activity that does not exist would read UNKNOWN forever with nothing saying
   * why. The database refuses both as well (composite foreign key, migration 0328); this refuses
   * them with a sentence naming which activity was wrong.
   */
  async create(input: {
    tenantId: Id; projectId: Id; name: string; targetDate: string;
    ownerId?: Id | null; gatingTaskIds?: Id[]; actorId?: Id | null;
  }): Promise<ProjectMilestone> {
    const schedule = await this.schedules.getByProject(input.tenantId, input.projectId);
    if (!schedule) {
      throw new BadRequestException(
        `project ${input.projectId} has no programme yet, and a milestone gates on activities in one`,
      );
    }
    const known = new Set(schedule.tasks.map((task) => task.id));
    for (const taskId of input.gatingTaskIds ?? []) {
      if (!known.has(taskId)) {
        throw new BadRequestException(`activity ${taskId} does not belong to project ${input.projectId}`);
      }
    }

    const milestone = makeProjectMilestone({
      tenantId: input.tenantId,
      projectId: input.projectId,
      scheduleId: schedule.id,
      name: input.name,
      targetDate: input.targetDate,
      ownerId: input.ownerId ?? null,
      gatingTaskIds: input.gatingTaskIds ?? [],
      createdBy: input.actorId ?? null,
    });
    await this.store.create(milestone);
    await this.raiseOwnerReceipt(milestone, input.actorId ?? null);
    await this.emit(MILESTONE_EVENT.created, milestone, input.actorId ?? null, {
      targetDate: milestone.targetDate, gating: milestone.gatingTaskIds.length,
    });
    return milestone;
  }

  /**
   * Put the milestone in its owner's My Work, through the canonical responsibility path.
   *
   * A milestone nobody was told about is a date in a database. This reuses the proven assignment
   * chain rather than inventing a parallel inbox, so the owner accepts, starts and completes it in
   * the one place they already look.
   *
   * A failure here does NOT fail the milestone. The milestone is the record; the notification is a
   * consequence of it, and losing the second must not destroy the first — the milestone's own
   * `ownerId` still says who is answerable, so the fact survives even when the receipt does not.
   */
  private async raiseOwnerReceipt(milestone: ProjectMilestone, actorId: Id | null): Promise<void> {
    if (!milestone.ownerId || !this.responsibilities || !actorId) return;
    try {
      await this.responsibilities.assign({
        tenantId: milestone.tenantId,
        projectId: milestone.projectId,
        workstream: 'planning',
        title: `Milestone: ${milestone.name}`,
        description: `Answerable for this programme milestone, committed for ${milestone.targetDate}.`,
        assigneeId: milestone.ownerId,
        assignedBy: actorId,
        dueDate: milestone.targetDate,
      });
    } catch (error) {
      // The milestone stands — but the failure is never silent. A receipt that disappeared without
      // a word would leave a milestone whose owner believes they were told and was not, which is
      // exactly the kind of quiet gap between two records this programme exists to remove.
      this.logger.warn(
        `milestone "${milestone.name}" was saved, but its owner ${milestone.ownerId} was NOT given a My Work item: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Every milestone on a project, each resolved against the programme as it stands today.
   *
   * ONE forecast run for the whole list, not one per milestone: a project with a dozen milestones
   * is one CPM pass, and the alternative is how a plan screen becomes slow enough that people stop
   * opening it.
   */
  async viewsFor(tenantId: Id, projectId: Id, today: string): Promise<MilestoneView[]> {
    const milestones = await this.store.list({ tenantId, projectId });
    if (milestones.length === 0) return [];
    const [forecast, calendar] = await Promise.all([
      this.schedule.forecast(tenantId, projectId, today),
      this.calendarFor(tenantId, projectId, milestones, today),
    ]);
    const placements = new Map(forecast.placements.map((placement) => [placement.taskId, placement]));

    return milestones.map((milestone) => resolveMilestone({
      milestone,
      gating: milestone.gatingTaskIds.map<GatingActivity>((taskId) => {
        const placement = placements.get(taskId);
        return {
          taskId,
          // An activity the forecast no longer knows about was deleted from the plan and its gate
          // cascaded; naming it plainly beats an id nobody can resolve.
          name: placement?.name ?? 'activity no longer in the programme',
          percentComplete: placement?.percentComplete ?? 0,
          measured: placement?.measured ?? false,
          forecastFinish: placement?.forecastFinish ?? null,
          complete: placement?.complete ?? false,
        };
      }),
      today,
      calendar,
    }));
  }

  async view(tenantId: Id, id: Id, today: string): Promise<MilestoneView> {
    const milestone = await this.mine(tenantId, id);
    const views = await this.viewsFor(tenantId, milestone.projectId, today);
    const found = views.find((view) => view.milestone.id === milestone.id);
    if (!found) throw new NotFoundException(`milestone ${id} not found`);
    return found;
  }

  /** Record that a milestone was met, on the day it was met. */
  async achieve(input: {
    tenantId: Id; id: Id; on: string; today: string; actorId?: Id | null; note?: string | null;
  }): Promise<MilestoneView> {
    const milestone = await this.mine(input.tenantId, input.id);
    const met = achieveMilestone(milestone, {
      on: input.on, by: input.actorId ?? null, note: input.note ?? null, today: input.today,
    });
    await this.store.update(met);
    await this.emit(MILESTONE_EVENT.achieved, met, input.actorId ?? null, { achievedOn: met.achievedOn });
    return this.view(input.tenantId, met.id, input.today);
  }

  /** Withdraw an achievement that should not stand. Requires a reason; see the domain rule. */
  async withdraw(input: {
    tenantId: Id; id: Id; reason: string; today: string; actorId?: Id | null;
  }): Promise<MilestoneView> {
    const milestone = await this.mine(input.tenantId, input.id);
    const cleared = clearMilestoneAchievement(milestone, { reason: input.reason, by: input.actorId ?? null });
    await this.store.update(cleared);
    await this.emit(MILESTONE_EVENT.withdrawn, cleared, input.actorId ?? null, { reason: input.reason });
    return this.view(input.tenantId, cleared.id, input.today);
  }

  /**
   * Resolve a milestone that belongs to THIS tenant.
   *
   * A milestone from another tenant is reported as not found rather than forbidden: confirming that
   * an id exists elsewhere is itself a disclosure, and the caller has no business knowing.
   */
  private async mine(tenantId: Id, id: Id): Promise<ProjectMilestone> {
    const milestone = await this.store.get(id);
    if (!milestone || milestone.tenantId !== tenantId) throw new NotFoundException(`milestone ${id} not found`);
    return milestone;
  }

  /**
   * The project's working calendar, over a horizon wide enough to hold every milestone.
   *
   * Wide deliberately: a variance is counted between a target and a forecast, and either can sit
   * outside the programme's own span — a milestone committed for next year, or one whose gating
   * work has slipped past it. A horizon that stopped at the plan's edges would silently count the
   * days beyond it as working ones.
   */
  private async calendarFor(tenantId: Id, projectId: Id, milestones: ProjectMilestone[], today: string) {
    if (!this.calendars) return undefined;
    const dates = [today, ...milestones.map((milestone) => milestone.targetDate)];
    const from = dates.reduce((min, date) => (date < min ? date : min), dates[0]);
    const to = dates.reduce((max, date) => (date > max ? date : max), dates[0]);
    // A year either side of what is known, so a forecast landing past the last target is still
    // counted under the calendar rather than under an assumption.
    const year = (date: string, delta: number) =>
      `${String(Number(date.slice(0, 4)) + delta)}${date.slice(4)}`;
    const resolved = await this.calendars.forProject(tenantId, projectId, {
      from: year(from, -1), to: year(to, 1),
    });
    return resolved.calendar;
  }

  private async emit(
    type: string, milestone: ProjectMilestone, actorId: Id | null, payload: Record<string, unknown>,
  ): Promise<void> {
    await this.events.append([
      makeEvent({
        type,
        tenantId: milestone.tenantId, companyId: null, actorId,
        aggregateType: 'projects.milestone', aggregateId: milestone.id,
        payload: { projectId: milestone.projectId, name: milestone.name, ...payload },
      }),
    ]);
  }
}
