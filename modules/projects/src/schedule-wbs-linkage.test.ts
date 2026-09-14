import { describe, expect, it, vi } from 'vitest';
import type { AuditService, EventStore } from '@aura/core';
import { InMemoryScheduleStore } from './in-memory-schedule-store';
import { InMemoryResourceFactsStore } from './in-memory-resource-facts-store';
import { InMemoryPlanningRunStore } from './in-memory-planning-run-store';
import { InMemoryWbsStore } from './in-memory-wbs-store';
import { ScheduleService } from './schedule.service';
import { makeWbsNode } from './domain/wbs';

const TENANT = 'schedule-wbs-test';
const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fixture() {
  const schedules = new InMemoryScheduleStore();
  const wbs = new InMemoryWbsStore();
  const events = { append: vi.fn(async () => undefined), appendWithClient: vi.fn(async () => undefined) } as unknown as EventStore;
  const audit = { log: vi.fn(async () => undefined) } as unknown as AuditService;
  const service = new ScheduleService(
    schedules,
    events,
    new InMemoryResourceFactsStore(),
    new InMemoryPlanningRunStore(),
    null,
    audit,
    null,
    wbs,
  );
  return { schedules, wbs, service };
}

const activity = (wbsNodeId?: string) => ({
  name: 'Install CCTV devices',
  plannedStart: '2026-09-20',
  plannedEnd: '2026-09-22',
  wbsNodeId,
});

describe('ScheduleService canonical WBS activity linkage', () => {
  it('requires a canonical same-project WBS node for a new activity and persists it', async () => {
    const fx = fixture();
    const node = makeWbsNode({ tenantId: TENANT, projectId: PROJECT, code: '1.1', title: 'CCTV installation' });
    const foreign = makeWbsNode({ tenantId: TENANT, projectId: OTHER, code: '9.1', title: 'Other project' });
    await fx.wbs.create(node);
    await fx.wbs.create(foreign);

    await expect(fx.service.save({ tenantId: TENANT, projectId: PROJECT, tasks: [activity()] }))
      .rejects.toThrow('wbsNodeId is required');
    await expect(fx.service.save({ tenantId: TENANT, projectId: PROJECT, tasks: [activity(foreign.id)] }))
      .rejects.toThrow(`does not belong to project ${PROJECT}`);

    const saved = await fx.service.save({ tenantId: TENANT, projectId: PROJECT, tasks: [activity(node.id)] });
    expect(saved.tasks[0].wbsNodeId).toBe(node.id);
    expect((await fx.schedules.getByProject(TENANT, PROJECT))?.tasks[0].wbsNodeId).toBe(node.id);
  });

  it('preserves an established WBS link when omitted on edit and refuses moving it', async () => {
    const fx = fixture();
    const first = makeWbsNode({ tenantId: TENANT, projectId: PROJECT, code: '1.1', title: 'CCTV' });
    const second = makeWbsNode({ tenantId: TENANT, projectId: PROJECT, code: '1.2', title: 'Access control' });
    await fx.wbs.create(first);
    await fx.wbs.create(second);
    const saved = await fx.service.save({ tenantId: TENANT, projectId: PROJECT, tasks: [activity(first.id)] });

    const edited = await fx.service.save({
      tenantId: TENANT,
      projectId: PROJECT,
      tasks: [{ ...activity(), id: saved.tasks[0].id, name: 'Install CCTV field devices' }],
    });
    expect(edited.tasks[0].wbsNodeId).toBe(first.id);

    await expect(fx.service.save({
      tenantId: TENANT,
      projectId: PROJECT,
      tasks: [{ ...activity(second.id), id: saved.tasks[0].id }],
    })).rejects.toThrow(`already linked to WBS node ${first.id}`);
  });
});
