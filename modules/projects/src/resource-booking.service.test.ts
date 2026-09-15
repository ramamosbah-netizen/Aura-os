import { describe, expect, it } from 'vitest';
import { makeProjectSchedule } from './domain/schedule';
import { makeResourceCapacity } from './domain/resource-pool';
import { InMemoryResourceBookingStore } from './in-memory-resource-booking-store';
import { InMemoryResourceFactsStore } from './in-memory-resource-facts-store';
import { InMemoryResourcePlanningStore } from './in-memory-resource-planning-store';
import { InMemoryScheduleStore } from './in-memory-schedule-store';
import { ResourceBookingService } from './resource-booking.service';

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
