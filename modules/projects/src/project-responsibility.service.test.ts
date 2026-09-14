import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '@aura/core';
import { InMemoryProjectResponsibilityStore } from './in-memory-project-responsibility-store';
import { ProjectResponsibilityService } from './project-responsibility.service';

describe('ProjectResponsibilityService', () => {
  const setup = () => {
    const store = new InMemoryProjectResponsibilityStore();
    const access = new AccessService(null);
    access.seedStandardRoles();
    access.registerRole({ id: 'responsibility-worker', name: 'Responsibility worker', permissions: ['projects.responsibility.update'] });
    access.grant({ userId: 'manager', roleId: 'r-pm', scope: { kind: 'resource', resourceType: 'project', resourceId: 'project-a' } });
    access.grant({ userId: 'engineer', roleId: 'responsibility-worker', scope: { kind: 'resource', resourceType: 'project', resourceId: 'project-a' } });
    const projects = { get: vi.fn(async (id: string) => id === 'project-a' ? { id, tenantId: 'tenant-a' } : null) };
    const events = { append: vi.fn(async () => undefined) };
    return { service: new ProjectResponsibilityService(store, events as never, null, projects as never, access), events };
  };

  it('keeps assignment separate from membership and enforces the assignee lifecycle', async () => {
    const { service } = setup();
    const row = await service.assign({ tenantId: 'tenant-a', projectId: 'project-a', workstream: 'engineering_release', title: 'Release IFC drawings', assigneeId: 'engineer', assignedBy: 'manager', dueDate: '2026-09-20' });
    expect(row.status).toBe('assigned');
    await expect(service.accept(row.id, 'project-a', 'manager')).rejects.toThrow('only the assigned user');
    expect((await service.accept(row.id, 'project-a', 'engineer')).status).toBe('accepted');
    expect((await service.start(row.id, 'project-a', 'engineer')).status).toBe('in_progress');
    expect((await service.complete(row.id, 'project-a', 'engineer')).status).toBe('completed');
  });

  it('refuses an assignee who has no membership in the canonical project', async () => {
    const { service } = setup();
    await expect(service.assign({ tenantId: 'tenant-a', projectId: 'project-a', workstream: 'planning', title: 'Publish baseline', assigneeId: 'outsider', assignedBy: 'manager' })).rejects.toThrow('assignee must be a member');
  });
});
