import { Inject, Injectable, Optional } from '@nestjs/common';
import { CalendarService } from '@aura/core';
import type { Id } from '@aura/shared';
import { PROJECT_STORE, type ProjectStore } from './project-store';
import { ALL_DAYS_WORKING, workingCalendarOf, type WorkingCalendar } from './domain/working-calendar';
import { resolveNonWorkingDays } from './resource-calendar';

/**
 * Which working calendar governs a project's dates — one answer, in one place.
 *
 * Before this, the solver chose by guessing: the tenant's calendars ordered by name, take the
 * first. For a company with one calendar that is right by luck; for one running Dubai and Riyadh
 * crews it silently plans a Saudi job through a UAE Friday, and no screen says which calendar
 * produced the dates.
 *
 * The project now names its calendar (migration 0324) and everything that counts a day asks here:
 * the planning solver, the save-time check that a duration fits its window, and the productivity
 * rates. Two callers resolving their own calendar is how a product ends up reporting a different
 * number of days for the same window on two screens.
 *
 * NO CALENDAR NAMED MEANS EVERY DAY IS WORKED, and it is reported as such rather than defaulted
 * around. That is `ALL_DAYS_WORKING` used as the caller's assertion it was always documented to be
 * — not an invented fact, and never a substitute calendar chosen on somebody's behalf.
 */

export interface ResolvedProjectCalendar {
  /** The calendar named by the project, or null when nobody has named one. */
  calendarId: Id | null;
  /** Its display name, for a screen that has to say which calendar produced a date. */
  calendarName: string | null;
  /** Non-working days inside the interval asked about. Empty when no calendar is named. */
  nonWorkingDays: string[];
  /** The predicate the pure planning rules consume. */
  calendar: WorkingCalendar;
  /**
   * True when no calendar is named and every day is therefore counted as worked. Surfaced rather
   * than hidden: a plan built through weekends should say so on the screen that built it.
   */
  everyDayWorked: boolean;
}

@Injectable()
export class ProjectCalendarService {
  constructor(
    @Inject(PROJECT_STORE) private readonly projects: ProjectStore,
    // Optional for the same reason every seam is: without the kernel calendar, every day is worked
    // and the planner behaves exactly as it did before Step 8.
    @Optional() @Inject(CalendarService) private readonly calendars: CalendarService | null = null,
  ) {}

  /**
   * Resolve the project's calendar over `[from, to]`.
   *
   * A calendar the kernel no longer knows about resolves as "none named" rather than throwing: the
   * assignment is checked when it is SET, and a plan must still open after somebody deletes a
   * calendar out from under it.
   */
  async forProject(tenantId: Id, projectId: Id, interval: { from: string; to: string }): Promise<ResolvedProjectCalendar> {
    const none: ResolvedProjectCalendar = {
      calendarId: null, calendarName: null, nonWorkingDays: [], calendar: ALL_DAYS_WORKING, everyDayWorked: true,
    };
    if (!this.calendars) return none;
    const project = await this.projects.get(projectId);
    // Another tenant's project is not this plan's calendar, and a missing one names nothing.
    if (!project || project.tenantId !== tenantId || !project.workingCalendarId) return none;

    const definition = (await this.calendars.listCalendars(tenantId))
      .find((candidate) => candidate.id === project.workingCalendarId);
    if (!definition) return none;

    const nonWorkingDays = await resolveNonWorkingDays(this.calendars, definition.id, interval);
    return {
      calendarId: definition.id,
      calendarName: definition.name,
      nonWorkingDays,
      calendar: workingCalendarOf(nonWorkingDays),
      everyDayWorked: false,
    };
  }

  /**
   * Name the calendar a project's dates are counted under, or clear it with null.
   *
   * Checked against the kernel's list rather than by a foreign key (ADR-0004): a calendar from
   * another tenant, or one that does not exist, is refused where a planner can see the refusal.
   */
  async assign(tenantId: Id, projectId: Id, calendarId: Id | null): Promise<{ calendarId: Id | null; calendarName: string | null }> {
    const project = await this.projects.get(projectId);
    if (!project || project.tenantId !== tenantId) throw new Error(`project ${projectId} not found`);

    let name: string | null = null;
    if (calendarId) {
      if (!this.calendars) throw new Error('working calendars are unavailable in this composition');
      const definition = (await this.calendars.listCalendars(tenantId)).find((candidate) => candidate.id === calendarId);
      if (!definition) throw new Error(`working calendar ${calendarId} does not belong to this tenant`);
      name = definition.name;
    }
    await this.projects.update({ ...project, workingCalendarId: calendarId });
    return { calendarId, calendarName: name };
  }
}
