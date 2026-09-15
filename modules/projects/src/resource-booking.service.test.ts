import { describe, expect, it } from 'vitest';
import { makeProjectSchedule } from './domain/schedule';
import { makeResourceCapacity } from './domain/resource-pool';
import { InMemoryResourceBookingStore } from './in-memory-resource-booking-store';
import { InMemoryResourceFactsStore } from './in-memory-resource-facts-store';
import { InMemoryResourcePlanningStore } from './in-memory-resource-planning-store';
import { InMemoryScheduleStore } from './in-memory-schedule-store';
import { ResourceBookingService } from './resource-booking.service';
import type { ResourceAvailabilityFact } from './domain/resource-availability';

const POOL = { resourceType: 'pool' as const, canonicalResourceId: 'pool-elv' };

async function setup() {
  const schedules = new InMemoryScheduleStore();
  const bookingStore = new InMemoryResourceBookingStore();
  const facts = new InMemoryResourceFactsStore();
  facts.addCapacity(makeResourceCapacity({
    tenantId: 'tenant-a', resource: POOL, unit: 'crews', quantity: 1,
    from: '2026-10-01', to: '2026-10-03',
  }));
  const create = async (projectId: string, requirementId: string) => {
    const schedule = makeProjectSchedule({
      tenantId: 'tenant-a', projectId,
      tasks: [{
        name: `Install CCTV ${projectId}`, wbsNodeId: `wbs-${projectId}`,
        plannedStart: '2026-10-01', plannedEnd: '2026-10-03', durationWorkingDays: 3,
        requirements: [{ id: requirementId, resource: POOL, unit: 'crews', quantity: 1 }],
      }],
    });
    await schedules.create(schedule);
    return schedule;
  };
  return { schedules, bookingStore, facts, service: new ResourceBookingService(bookingStore, facts, schedules), create };
}

describe('ResourceBookingService', () => {
  it('shares no-database capacity, booking writes and conflict reads through one authority', async () => {
    const schedules = new InMemoryScheduleStore();
    const resources = new InMemoryResourcePlanningStore();
    await resources.createCapacity(makeResourceCapacity({
      tenantId: 'tenant-a', resource: POOL, unit: 'crews', quantity: 1,
      from: '2026-10-01', to: '2026-10-03',
    }));
    const schedule = makeProjectSchedule({
      tenantId: 'tenant-a', projectId: '11111111-1111-4111-8111-111111111111',
      tasks: [{
        name: 'Install CCTV', wbsNodeId: 'wbs-a', plannedStart: '2026-10-01', plannedEnd: '2026-10-03',
        durationWorkingDays: 3, requirements: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resource: POOL, unit: 'crews', quantity: 1 }],
      }],
    });
    await schedules.create(schedule);
    const service = new ResourceBookingService(resources, resources, schedules);

    const committed = await service.commitRequirement({
      tenantId: 'tenant-a', projectId: schedule.projectId, requirementId: schedule.tasks[0].requirements[0].id,
    });

    expect(committed.booking).toMatchObject({ capacityAtCommitment: 1, demandAtCommitment: 1 });
    expect((await service.listProject('tenant-a', schedule.projectId))[0].assessment.feasibility).toBe('AVAILABLE');
  });

  it('derives resource, quantity and dates from persisted activity demand', async () => {
    const { service, create } = await setup();
    const schedule = await create('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const view = await service.commitRequirement({
      tenantId: 'tenant-a', projectId: schedule.projectId,
      requirementId: schedule.tasks[0].requirements[0].id, committedBy: 'planner',
    });

    expect(view.booking).toMatchObject({
      projectId: schedule.projectId, scheduleId: schedule.id, taskId: schedule.tasks[0].id,
      requirementId: schedule.tasks[0].requirements[0].id, resource: POOL,
      unit: 'crews', quantity: 1, from: '2026-10-01', to: '2026-10-03', status: 'held',
      capacityAtCommitment: 1, demandAtCommitment: 1,
    });
    expect(view.assessment.feasibility).toBe('AVAILABLE');
    await expect(service.commitRequirement({
      tenantId: 'tenant-a', projectId: schedule.projectId,
      requirementId: schedule.tasks[0].requirements[0].id,
    })).rejects.toThrow('already has a held booking');
  });

  it('surfaces a cross-project over-capacity commitment and requires a reason', async () => {
    const { service, create, facts } = await setup();
    const a = await create('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const b = await create('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const first = await service.commitRequirement({ tenantId: 'tenant-a', projectId: a.projectId, requirementId: a.tasks[0].requirements[0].id });
    facts.addBooking(first.booking);

    await expect(service.commitRequirement({ tenantId: 'tenant-a', projectId: b.projectId, requirementId: b.tasks[0].requirements[0].id }))
      .rejects.toThrow('requires a reason');
    const second = await service.commitRequirement({
      tenantId: 'tenant-a', projectId: b.projectId, requirementId: b.tasks[0].requirements[0].id,
      overCapacityReason: 'approved weekend recovery crew',
    });
    expect(second.booking).toMatchObject({ capacityAtCommitment: 1, demandAtCommitment: 2, overCapacityReason: 'approved weekend recovery crew' });
    expect(second.assessment.feasibility).toBe('CONFLICTED');
    expect(second.resourceConflict.projectsInvolved).toEqual([a.projectId, b.projectId]);
  });

  it('lists a resource’s held commitments across projects, naming the activity it reads through', async () => {
    // One shared authority for writes and conflict reads, so a release is visible to the next
    // read exactly as it is in the live composition.
    const schedules = new InMemoryScheduleStore();
    const resources = new InMemoryResourcePlanningStore();
    await resources.createCapacity(makeResourceCapacity({
      tenantId: 'tenant-a', resource: POOL, unit: 'crews', quantity: 1, from: '2026-10-01', to: '2026-10-03',
    }));
    const service = new ResourceBookingService(resources, resources, schedules);
    const plan = async (projectId: string, requirementId: string) => {
      const schedule = makeProjectSchedule({
        tenantId: 'tenant-a', projectId,
        tasks: [{
          name: `Install CCTV ${projectId}`, wbsNodeId: `wbs-${projectId}`,
          plannedStart: '2026-10-01', plannedEnd: '2026-10-03', durationWorkingDays: 3,
          requirements: [{ id: requirementId, resource: POOL, unit: 'crews', quantity: 1 }],
        }],
      });
      await schedules.create(schedule);
      return schedule;
    };
    const a = await plan('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const b = await plan('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await service.commitRequirement({ tenantId: 'tenant-a', projectId: a.projectId, requirementId: a.tasks[0].requirements[0].id });
    const second = await service.commitRequirement({
      tenantId: 'tenant-a', projectId: b.projectId, requirementId: b.tasks[0].requirements[0].id,
      overCapacityReason: 'approved weekend recovery crew',
    });

    const window = { from: '2026-10-01', to: '2026-10-31' };
    const assignments = await service.listAssignments('tenant-a', POOL, window);
    expect(assignments.map((view) => view.booking.projectId)).toEqual([a.projectId, b.projectId]);
    expect(assignments.map((view) => view.activityName)).toEqual([`Install CCTV ${a.projectId}`, `Install CCTV ${b.projectId}`]);

    // Released capacity is not an assignment: it holds nothing, so it is nobody's work.
    await service.release({ tenantId: 'tenant-a', projectId: b.projectId, bookingId: second.booking.id, reason: 'recovery crew reassigned' });
    expect((await service.listAssignments('tenant-a', POOL, window)).map((view) => view.booking.projectId)).toEqual([a.projectId]);

    // A different resource is a different question, even with an identical id.
    expect(await service.listAssignments('tenant-a', { resourceType: 'employee', canonicalResourceId: 'pool-elv' }, window)).toEqual([]);
    // And so is a window the commitment does not touch.
    expect(await service.listAssignments('tenant-a', POOL, { from: '2027-01-01', to: '2027-01-31' })).toEqual([]);
    // Another tenant sees none of it.
    expect(await service.listAssignments('tenant-b', POOL, window)).toEqual([]);
  });

  it('records the allocated person’s answer without touching the commitment', async () => {
    const { service, create } = await setup();
    const schedule = await create('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const held = await service.commitRequirement({
      tenantId: 'tenant-a', projectId: schedule.projectId, requirementId: schedule.tasks[0].requirements[0].id,
    });

    await expect(service.respond({
      tenantId: 'tenant-a', bookingId: held.booking.id, response: 'declined',
    })).rejects.toThrow(/requires a reason/);

    const refused = await service.respond({
      tenantId: 'tenant-a', bookingId: held.booking.id, response: 'declined',
      reason: 'already committed to the Marina site that week', actorId: 'u-maya',
    });
    expect(refused.booking).toMatchObject({
      response: 'declined', responseReason: 'already committed to the Marina site that week', responseBy: 'u-maya',
      // Everything the project committed to is untouched: a refusal is news, not a change.
      status: 'held', quantity: held.booking.quantity, from: held.booking.from, to: held.booking.to,
    });
    expect(refused.activityName).toBe(`Install CCTV ${schedule.projectId}`);

    // The capacity is still committed, so the project still sees its own held commitment.
    const stillHeld = await service.listProject('tenant-a', schedule.projectId);
    expect(stillHeld[0].booking).toMatchObject({ status: 'held', response: 'declined' });

    const accepted = await service.respond({ tenantId: 'tenant-a', bookingId: held.booking.id, response: 'accepted', actorId: 'u-maya' });
    expect(accepted.booking).toMatchObject({ response: 'accepted', responseReason: null });

    await expect(service.respond({ tenantId: 'tenant-a', bookingId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', response: 'accepted' }))
      .rejects.toThrow(/not found/);
  });

  it('lets a later availability change make a standing commitment conflicted, without touching it', async () => {
    const schedules = new InMemoryScheduleStore();
    const resources = new InMemoryResourcePlanningStore();
    await resources.createCapacity(makeResourceCapacity({
      tenantId: 'tenant-a', resource: POOL, unit: 'crews', quantity: 1, from: '2026-10-01', to: '2026-10-03',
    }));
    const schedule = makeProjectSchedule({
      tenantId: 'tenant-a', projectId: '11111111-1111-4111-8111-111111111111',
      tasks: [{
        name: 'Install CCTV', wbsNodeId: 'wbs-a', plannedStart: '2026-10-01', plannedEnd: '2026-10-03',
        durationWorkingDays: 3, requirements: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resource: POOL, unit: 'crews', quantity: 1 }],
      }],
    });
    await schedules.create(schedule);

    // Nothing is said yet, so the commitment is made against declared capacity alone and fits.
    let stated: ResourceAvailabilityFact[] = [];
    const provider = { unavailability: async () => stated };
    const service = new ResourceBookingService(resources, resources, schedules, provider);
    const committed = await service.commitRequirement({
      tenantId: 'tenant-a', projectId: schedule.projectId, requirementId: schedule.tasks[0].requirements[0].id,
    });
    expect(committed.assessment.feasibility).toBe('AVAILABLE');

    // …and then the owning register says the resource is not there on one of those days.
    stated = [{
      resource: POOL, from: '2026-10-02', to: '2026-10-02', effect: 'absent',
      reason: 'approved annual leave', source: 'hr',
    }];
    const [seen] = await service.listProject('tenant-a', schedule.projectId);
    expect(seen.assessment.feasibility).toBe('CONFLICTED');
    // The case a planner most needs named: nobody did anything wrong, and it says why.
    expect(seen.assessment.becameInfeasible).toBe(true);
    expect(seen.assessment.reason).toContain('approved annual leave');
    expect(seen.resourceConflict.reason).toContain('approved annual leave');
    // The commitment record itself is untouched — the leave changed the verdict, not the history.
    expect(seen.booking).toMatchObject({
      status: 'held', quantity: 1, capacityAtCommitment: 1, demandAtCommitment: 1,
      committedAt: committed.booking.committedAt,
    });

    // An undated statement is UNKNOWN, which is never AVAILABLE and is not a conflict either.
    stated = [{
      resource: POOL, from: '2026-10-01', to: '2026-10-03', effect: 'unknown',
      reason: 'off the road with no stated return date', source: 'fleet',
    }];
    const [unknown] = await service.listProject('tenant-a', schedule.projectId);
    expect(unknown.assessment.feasibility).toBe('UNKNOWN');
    expect(unknown.assessment.reason).toContain('no stated return date');
  });

  it('is unchanged when no availability provider is bound, and when one fails', async () => {
    const schedules = new InMemoryScheduleStore();
    const resources = new InMemoryResourcePlanningStore();
    await resources.createCapacity(makeResourceCapacity({
      tenantId: 'tenant-a', resource: POOL, unit: 'crews', quantity: 1, from: '2026-10-01', to: '2026-10-03',
    }));
    const schedule = makeProjectSchedule({
      tenantId: 'tenant-a', projectId: '11111111-1111-4111-8111-111111111111',
      tasks: [{
        name: 'Install CCTV', wbsNodeId: 'wbs-a', plannedStart: '2026-10-01', plannedEnd: '2026-10-03',
        durationWorkingDays: 3, requirements: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resource: POOL, unit: 'crews', quantity: 1 }],
      }],
    });
    await schedules.create(schedule);

    // Unbound: §22 governs by its own declared capacity, exactly as before this existed.
    const unbound = new ResourceBookingService(resources, resources, schedules);
    const committed = await unbound.commitRequirement({
      tenantId: 'tenant-a', projectId: schedule.projectId, requirementId: schedule.tasks[0].requirements[0].id,
    });
    expect(committed.assessment.feasibility).toBe('AVAILABLE');

    // A failing provider is treated as silence, never as a favourable answer.
    const broken = new ResourceBookingService(resources, resources, schedules, {
      unavailability: async () => { throw new Error('HR is down'); },
    });
    const [seen] = await broken.listProject('tenant-a', schedule.projectId);
    expect(seen.assessment.feasibility).toBe('AVAILABLE');
  });

  it('refuses another project requirement and retains released history', async () => {
    const { service, create } = await setup();
    const a = await create('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const b = await create('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await expect(service.commitRequirement({ tenantId: 'tenant-a', projectId: a.projectId, requirementId: b.tasks[0].requirements[0].id }))
      .rejects.toThrow('does not belong');
    const held = await service.commitRequirement({ tenantId: 'tenant-a', projectId: a.projectId, requirementId: a.tasks[0].requirements[0].id });
    const released = await service.release({ tenantId: 'tenant-a', projectId: a.projectId, bookingId: held.booking.id, reason: 'activity moved', actorId: 'planner' });
    expect(released).toMatchObject({ status: 'released', releasedReason: 'activity moved', releasedBy: 'planner' });
    expect(await service.listProject('tenant-a', a.projectId)).toHaveLength(1);
  });
});
