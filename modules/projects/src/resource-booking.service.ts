import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { type Id, assertSameTenant, sameTenantOrNull } from '@aura/shared';
import { assessBooking, commitBooking, releaseBooking, respondToBooking, type BookingAssessment, type BookingResponse, type ResourceBooking } from './domain/resource-booking';
import { type ResourceRef, resourceKey, sameResource } from './domain/resource-ref';
import {
  RESOURCE_AVAILABILITY_PROVIDER,
  type ResourceAvailabilityFact,
  type ResourceAvailabilityProvider,
} from './domain/resource-availability';
import { assessResourceAcrossProjects, dayLoadsForBooking, resolveResourceLoad, type ResourceConflictReport } from './domain/resource-facts';
import { RESOURCE_BOOKING_STORE, type ResourceBookingStore } from './resource-booking-store';
import { RESOURCE_FACTS_STORE, type ResourceFactsStore, type ResourceInterval } from './resource-facts-store';
import { RESOURCE_PLANNING_STORE, type ResourcePlanningStore } from './resource-planning-store';
import { resolutionForInterval, type ResourceConflictResolution } from './domain/resource-conflict-resolution';
import { SCHEDULE_STORE, type ScheduleStore } from './schedule-store';

export interface ResourceBookingView {
  booking: ResourceBooking;
  assessment: BookingAssessment;
  resourceConflict: ResourceConflictReport;
  /**
   * Who has taken this resource's conflicts on, and what they decided — `null` when nobody has.
   *
   * Reported BESIDE the verdict, never instead of it. A decided entry does not make a conflicted
   * resource read as fine: if the facts still clash, both are shown, because "owned, marked
   * resolved, still conflicted" is the state a planner most needs to see.
   */
  conflictOwner: ResourceConflictResolution | null;
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
  /**
   * The canonical work package the activity is linked to (migration 0315), read through with it.
   *
   * Carried because the lineage a conflict has to show — resource, booking, requirement, activity,
   * WBS, project — is only complete with this link, and it must come from the PERSISTED activity
   * rather than from anything a caller supplies. `null` when the activity is gone, or is a pre-0315
   * legacy one that never named a package.
   */
  wbsNodeId: Id | null;
}

@Injectable()
export class ResourceBookingService {
  constructor(
    @Inject(RESOURCE_BOOKING_STORE) private readonly store: ResourceBookingStore,
    @Inject(RESOURCE_FACTS_STORE) private readonly facts: ResourceFactsStore,
    @Inject(SCHEDULE_STORE) private readonly schedules: ScheduleStore,
    @Inject(RESOURCE_PLANNING_STORE) private readonly planning: ResourcePlanningStore,
    /**
     * Optional, and unbound is a real state rather than an error (see the port's own note): a
     * composition with no HR or Fleet behaves exactly as §22 did before availability was connected.
     * What it must never do is read silence as "everything is available".
     */
    @Optional() @Inject(RESOURCE_AVAILABILITY_PROVIDER)
    private readonly availability: ResourceAvailabilityProvider | null = null,
  ) {}

  /**
   * What the owning registers say about these resources over this interval.
   *
   * Failure is not fatal and is not silently favourable: if the provider throws, the answer is no
   * statements, which leaves §22's own declared capacity governing exactly as it did before — the
   * same outcome as an unbound provider, and never an upgrade to AVAILABLE.
   */
  private async availabilityFor(tenantId: Id, refs: readonly ResourceRef[], interval: { from: string; to: string }): Promise<ResourceAvailabilityFact[]> {
    if (!this.availability || refs.length === 0) return [];
    return this.availability.unavailability(tenantId, refs, interval).catch(() => []);
  }

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
    const [windows, held, stated, owners] = await Promise.all([
      this.facts.capacityWindowsFor(input.tenantId, [requirement.resource], interval),
      this.facts.heldBookingsFor(input.tenantId, [requirement.resource], interval),
      this.availabilityFor(input.tenantId, [requirement.resource], interval),
      this.planning.listConflictResolutions(input.tenantId, [requirement.resource]),
    ]);
    // What the registers say counts at COMMITMENT too, not only afterwards: committing somebody
    // into their own approved leave should cost the same stated reason as any other overrun,
    // rather than being recorded as a comfortable fit and becoming a conflict a second later.
    const dayAvailability = resolveResourceLoad(requirement.resource, windows, held, interval, undefined, stated)
      .map((entry) => ({
        day: entry.day, capacity: entry.capacity, alreadyCommitted: entry.committed, unit: entry.unit,
      }));
    let booking: ResourceBooking;
    try {
      booking = commitBooking({
        tenantId: input.tenantId, projectId: input.projectId, scheduleId: schedule.id, taskId: task.id,
        requirementId: requirement.id, resource: requirement.resource, unit: requirement.unit,
        quantity: requirement.quantity, from: interval.from, to: interval.to,
        overCapacityReason: input.overCapacityReason, committedBy: input.committedBy,
      }, dayAvailability);
      await this.store.create(booking);
    } catch (error) {
      if (/already has a held booking/.test(String(error))) throw new ConflictException('this activity requirement already has a held booking');
      if (error instanceof ConflictException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : 'the resource booking is invalid');
    }
    return this.view(booking, windows, [...held, booking], stated, owners);
  }

  /**
   * Every commitment this project holds, each with its current verdict.
   *
   * ONE read per source for the whole screen, not one per row. Each of these reads asks a register
   * about a set of resources over a span, so a per-booking loop asked the same questions again for
   * every line — and with availability connected, that meant re-listing HR's leave, Fleet's
   * vehicles and the asset register once per booking. The domain functions filter by resource and
   * by the booking's own dates themselves, so handing each verdict the superset is exactly as
   * correct and one round trip instead of N.
   */
  async listProject(tenantId: Id, projectId: Id): Promise<ResourceBookingView[]> {
    const rows = await this.store.listForProject(tenantId, projectId);
    if (rows.length === 0) return [];

    const refs = [...new Map(rows.map((booking) => [resourceKey(booking.resource), booking.resource])).values()];
    const span = {
      from: rows.reduce((earliest, booking) => (booking.from < earliest ? booking.from : earliest), rows[0].from),
      to: rows.reduce((latest, booking) => (booking.to > latest ? booking.to : latest), rows[0].to),
    };
    const [windows, held, stated, owners] = await Promise.all([
      this.facts.capacityWindowsFor(tenantId, refs, span),
      this.facts.heldBookingsFor(tenantId, refs, span),
      this.availabilityFor(tenantId, refs, span),
      this.planning.listConflictResolutions(tenantId, refs),
    ]);
    return rows.map((booking) => this.view(booking, windows, held, stated, owners));
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

    const tasks = await this.activityNames(tenantId, held);
    return held
      .map((booking) => ({ booking, ...this.activityOf(tasks, booking) }))
      .sort((a, b) => a.booking.from.localeCompare(b.booking.from) || a.booking.committedAt.localeCompare(b.booking.committedAt));
  }

  /**
   * The activity names for a set of bookings: one schedule read per PROJECT, not per booking.
   *
   * A person committed to six activities on one project is one read, and the alternative is how a
   * personal work list becomes slow enough that people stop opening it.
   */
  private async activityNames(
    tenantId: Id,
    bookings: readonly ResourceBooking[],
  ): Promise<Map<string, { name: string; wbsNodeId: Id | null }>> {
    const tasks = new Map<string, { name: string; wbsNodeId: Id | null }>();
    await Promise.all([...new Set(bookings.map((booking) => booking.projectId))].map(async (projectId) => {
      const schedule = await this.schedules.getByProject(tenantId, projectId);
      for (const task of schedule?.tasks ?? []) {
        tasks.set(`${projectId}:${task.id}`, { name: task.name, wbsNodeId: task.wbsNodeId });
      }
    }));
    return tasks;
  }

  /**
   * The activity a booking was made for, read from the PERSISTED schedule.
   *
   * Both halves come from the same lookup on purpose: the name and the work package are two facts
   * about one activity, and resolving them separately is how a screen ends up showing one
   * activity's name beside another's package. Null when the booking names no task, or the task it
   * named is gone — never a stale name.
   */
  private activityOf(
    tasks: Map<string, { name: string; wbsNodeId: Id | null }>,
    booking: ResourceBooking,
  ): { activityName: string | null; wbsNodeId: Id | null } {
    const found = booking.taskId ? tasks.get(`${booking.projectId}:${booking.taskId}`) : undefined;
    return { activityName: found?.name ?? null, wbsNodeId: found?.wbsNodeId ?? null };
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
    const tasks = await this.activityNames(input.tenantId, [answered]);
    return { booking: answered, ...this.activityOf(tasks, answered) };
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

  private view(
    booking: ResourceBooking,
    windows: Parameters<typeof assessResourceAcrossProjects>[1],
    held: ResourceBooking[],
    stated: readonly ResourceAvailabilityFact[] = [],
    owners: readonly ResourceConflictResolution[] = [],
  ): ResourceBookingView {
    const interval = { from: booking.from, to: booking.to };
    const mine = owners.filter((entry) => sameResource(entry.resource, booking.resource));
    return {
      booking,
      assessment: assessBooking(booking, dayLoadsForBooking(booking, windows, held, undefined, stated)),
      resourceConflict: assessResourceAcrossProjects(booking.resource, windows, held, interval, undefined, stated),
      // Beside the verdict, never instead of it.
      conflictOwner: resolutionForInterval(mine, interval),
    };
  }
}
