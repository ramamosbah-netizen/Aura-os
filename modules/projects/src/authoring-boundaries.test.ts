import { describe, expect, it, vi } from 'vitest';
import { AccessService, type EventStore } from '@aura/core';
import { CbsService } from './cbs.service';
import { InMemoryCbsStore } from './in-memory-cbs-store';
import { DelayEotService } from './delay-eot.service';
import { InMemoryDelayStore, InMemoryEotStore } from './in-memory-delay-eot-store';
import type { ProjectStore } from './project-store';
import { makeProject } from './domain/project';

const events = { append: vi.fn() } as unknown as EventStore;

function projectStore(project = makeProject({ tenantId: 'tenant-a', title: 'Authoring project' })) {
  return { get: vi.fn(async (id: string) => id === project.id ? project : null) } as unknown as ProjectStore;
}

describe('governed Project 360 authoring boundaries', () => {
  it('requires project ownership and governed permission for CBS creation', async () => {
    const access = { assert: vi.fn() } as unknown as AccessService;
    const project = makeProject({ tenantId: 'tenant-a', title: 'Authoring project' });
    const service = new CbsService(new InMemoryCbsStore(), events, projectStore(project), access);
    await service.create({ tenantId: 'tenant-a', projectId: project.id, code: '01', title: 'Equipment', createdBy: 'u-admin' });
    expect(access.assert).toHaveBeenCalledWith('u-admin', expect.objectContaining({ permission: 'projects.project.update' }));
    await expect(service.create({ tenantId: 'tenant-b', projectId: project.id, code: '02', title: 'Wrong tenant', createdBy: 'u-admin' })).rejects.toThrow('not found');
  });

  it('rejects a CBS parent from another project', async () => {
    const project = makeProject({ tenantId: 'tenant-a', title: 'Authoring project' });
    const other = makeProject({ tenantId: 'tenant-a', title: 'Other project' });
    const store = new InMemoryCbsStore();
    const parent = { id: 'parent', tenantId: 'tenant-a', projectId: other.id, parentId: null, code: '01', title: 'Other', category: 'direct' as const, budgetAmount: 0, committedAmount: 0, actualAmount: 0, forecastAmount: 0, variance: 0, currency: 'AED', notes: null, sourceRevisionId: null, handoverLocked: false, createdAt: new Date().toISOString() };
    await store.create(parent);
    const service = new CbsService(store, events, projectStore(project));
    await expect(service.create({ tenantId: 'tenant-a', projectId: project.id, parentId: parent.id, code: '01.01', title: 'Invalid child' })).rejects.toThrow('does not belong');
  });

  it('requires project ownership and permission for delay creation', async () => {
    const access = { assert: vi.fn() } as unknown as AccessService;
    const project = makeProject({ tenantId: 'tenant-a', title: 'Authoring project' });
    const service = new DelayEotService(new InMemoryDelayStore(), new InMemoryEotStore(), events, null, projectStore(project), access);
    await service.createDelay({ tenantId: 'tenant-a', projectId: project.id, title: 'Late permit', startDate: '2026-09-01', actorId: 'u-admin' });
    expect(access.assert).toHaveBeenCalledWith('u-admin', expect.objectContaining({ permission: 'projects.project.update' }));
    await expect(service.createDelay({ tenantId: 'tenant-b', projectId: project.id, title: 'Wrong tenant', startDate: '2026-09-01', actorId: 'u-admin' })).rejects.toThrow('not found');
  });
});
