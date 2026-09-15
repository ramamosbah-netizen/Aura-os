import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Id, assertSameTenant, sameTenantOrNull } from '@aura/shared';
import { assessBooking, commitBooking, releaseBooking, respondToBooking, type BookingAssessment, type BookingResponse, type ResourceBooking } from './domain/resource-booking';
import type { ResourceRef } from './domain/resource-ref';
import { assessResourceAcrossProjects, dayLoadsForBooking, resolveResourceLoad, type ResourceConflictReport } from './domain/resource-facts';
import { RESOURCE_BOOKING_STORE, type ResourceBookingStore } from './resource-booking-store';
import { RESOURCE_FACTS_STORE, type ResourceFactsStore, type ResourceInterval } from './resource-facts-store';
import { SCHEDULE_STORE, type ScheduleStore } from './schedule-store';

export interface ResourceBookingView {
  booking: ResourceBooking;
  assessment: BookingAssessment;
  resourceConflict: ResourceConflictReport;
}

/**
 * One commitment, seen from the RESOURCE's side rather than the project's.
 *
 * The project's own screens read `listProject`; this answers the other question — "what has been
 * committed against this crane / this person, by anyone?" — which is what a named allocation needs
 * before it can reach the person it names.
 *
 * `activityName` is READ THROUGH at query time, never copied onto the booking (DG-22.2): renaming
 * the activity renames it here, and a booking whose task has since been removed says so with null
 * instead of showing a name that is no longer anybody's.
 */
export interface ResourceAssignmentView {
  booking: ResourceBooking;
  activityName: string | null;
}

@Injectable()
export class ResourceBookingService {
  constructor(
    @Inject(RESOURCE_BOOKING_STORE) private readonly store: ResourceBookingStore,
    @Inject(RESOURCE_FACTS_STORE) private readonly facts: ResourceFactsStore,
    @Inject(SCHEDULE_STORE) private readonly schedules: ScheduleStore,
  ) {}

  async commitRequirement(input: {
    tenantId: Id; projectId: Id; requirementId: Id; overCapacityReason?: string | null; committedBy?: Id | null;
  }): Promise<ResourceBookingView> {
    const schedule = await this.schedules.getByProject(input.tenantId, input.projectId);
    if (!schedule) throw new NotFoundException(`no schedule for project ${input.projectId}`);
    const task = schedule.tasks.find((candidate) => candidate.requirements.some((requirement) => requirement.id === input.requirementId));
    const requirement = task?.requirements.find((candidate) => candidate.id === input.requirementId);
    if (!task || !requirement) {
      throw new BadRequestException('the selected requirement does not belong to this project schedule');
    }
    if (await this.store.heldForRequirement(input.tenantId, input.projectId, requirement.id)) {
      throw new ConflictException('this activity requirement already has a held booking');
    }

    const interval = { from: task.plannedStart, to: task.plannedEnd };
    const [windows, held] = await Promise.all([
      this.facts.capacityWindowsFor(input.tenantId, [requirement.resource], interval),
      this.facts.heldBookingsFor(input.tenantId, [requirement.resource], interval),
    ]);
    const availability = resolveResourceLoad(requirement.resource, windows, held, interval).map((entry) => ({
      day: entry.day, capacity: entry.capacity, alreadyCommitted: entry.committed, unit: entry.unit,
    }));
    let booking: ResourceBooking;
    try {
      booking = commitBooking({
        tenantId: input.tenantId, projectId: input.projectId, scheduleId: schedule.id, taskId: task.id,
        requirementId: requirement.id, resource: requirement.resource, unit: requirement.unit,
        quantity: requirement.quantity, from: interval.from, to: interval.to,
        overCapacityReason: input.overCapacityReason, committedBy: input.committedBy,
      }, availability);
      await this.store.create(booking);
    } catch (error) {
      if (/already has a held booking/.test(String(error))) throw new ConflictException('this activity requirement already has a held booking');
      if (error instanceof ConflictException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : 'the resource booking is invalid');
    }
    return this.view(booking, windows, [...held, booking]);
  }

  async listProject(tenantId: Id, projectId: Id): Promise<ResourceBookingView[]> {
    const rows = await this.store.listForProject(tenantId, projectId);
    return Promise.all(rows.map(async (booking) => {
      const interval = { from: booking.from, to: booking.to };
      const [windows, held] = await Promise.all([
        this.facts.capacityWindowsFor(tenantId, [booking.resource], interval),
        this.facts.heldBookingsFor(tenantId, [booking.resource], interval),
      ]);
      return this.view(booking, windows, held);
    }));
  }

  /**
   * Every HELD commitment against one resource, across every project in the tenant.
   *
   * Cross-project by design and by store contract: a person is one person, and an allocation view
   * that showed only the asking project's claim would be exactly the blindness §22 exists to
   * remove. Tenant isolation is absolute regardless — RLS scopes the read below this service.
   *
   * No access filtering happens here. Which of these a given VIEWER may see is a question about
   * the viewer, not about the resource, and it is answered where the viewer is known.
   */
  async listAssignments(tenantId: Id, resource: ResourceRef, interval: ResourceInterval): Promise<ResourceAssignmentView[]> {
    const held = await this.facts.heldBookingsFor(tenantId, [resource], interval);
    if (held.length === 0) return [];

    const names = await this.activityNames(tenantId, held);
    return held
      .map((booking) => ({ booking, activityName: this.activityName(names, booking) }))
      .sort((a, b) => a.booking.from.localeCompare(b.booking.from) || a.booking.committedAt.localeCompare(b.booking.committedAt));
  }

  /**
   * The activity names for a set of bookings: one schedule read per PROJECT, not per booking.
   *
   * A person committed to six activities on one project is one read, and the alternative is how a
   * personal work list becomes slow enough that people stop opening it.
   */
  private async activityNames(tenantId: Id, bookings: readonly ResourceBooking[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    await Promise.all([...new Set(bookings.map((booking) => booking.projectId))].map(async (projectId) => {
      const schedule = await this.schedules.getByProject(tenantId, projectId);
      for (const task of schedule?.tasks ?? []) names.set(`${projectId}:${task.id}`, task.name);
    }));
    return names;
  }

  /** Null when the booking names no task, or the task it named is gone — never a stale name. */
  private activityName(names: Map<string, string>, booking: ResourceBooking): string | null {
    return booking.taskId ? names.get(`${booking.projectId}:${booking.taskId}`) ?? null : null;
  }

  /**
   * One commitment by id, for a caller that has already established the right to see it.
   *
   * The store filters by tenant and this checks the row it returns anyway: a getter is the shape
   * that hands a record to a caller, and the store is an interface — an implementation that
   * ignored its tenant argument would otherwise leak silently here rather than fail loudly.
   */
  async get(tenantId: Id, bookingId: Id): Promise<ResourceBooking | null> {
    return sameTenantOrNull(await this.store.get(tenantId, bookingId), tenantId);
  }

  /**
   * Record the answer of the person a booking names.
   *
   * WHO may answer is not decided here. This service knows the booking names an employee; it does
   * not know which login that employee is — that is HR's answer (migration 0317) — so the caller
   * that does know establishes it and this records the result. The same separation as `release`,
   * which takes an `actorId` and trusts the boundary above it to have earned it.
   *
   * Nothing about the commitment changes: the domain writes only the answer, and the store's
   * update statement cannot reach resource, quantity, unit or dates even if it tried.
   */
  async respond(input: {
    tenantId: Id; bookingId: Id; response: Exclude<BookingResponse, 'pending'>;
    reason?: string | null; actorId?: Id | null;
  }): Promise<ResourceAssignmentView> {
    // Fetch-before-mutate: the tenant is asserted on the write path rather than assumed, and a
    // caller from the wrong tenant is told "not found" rather than that the record exists.
    const booking = assertSameTenant(
      await this.store.get(input.tenantId, input.bookingId),
      input.tenantId, 'resource booking', input.bookingId,
    );
    let answered: ResourceBooking;
    try {
      answered = respondToBooking(booking, { response: input.response, reason: input.reason, actorId: input.actorId });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'the allocation response is invalid');
    }
    // The same answer again writes nothing, and still reports the current state to the caller.
    if (answered !== booking) await this.store.update(answered);
    const names = await this.activityNames(input.tenantId, [answered]);
    return { booking: answered, activityName: this.activityName(names, answered) };
  }

  async release(input: { tenantId: Id; projectId: Id; bookingId: Id; reason: string; actorId?: Id | null }): Promise<ResourceBooking> {
    const booking = await this.store.get(input.tenantId, input.bookingId);
    if (!booking || booking.projectId !== input.projectId) throw new NotFoundException('resource booking not found in this project');
    let released: ResourceBooking;
    try {
      released = releaseBooking(booking, { reason: input.reason, actorId: input.actorId });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'the resource booking cannot be released');
    }
    await this.store.update(released);
    return released;
  }

  private view(booking: ResourceBooking, windows: Parameters<typeof assessResourceAcrossProjects>[1], held: ResourceBooking[]): ResourceBookingView {
    const resourceConflict = assessResourceAcrossProjects(booking.resource, windows, held, { from: booking.from, to: booking.to });
    return {
      booking,
      assessment: assessBooking(booking, dayLoadsForBooking(booking, windows, held)),
      resourceConflict,
    };
  }
}
