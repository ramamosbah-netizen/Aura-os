import { describe, expect, it, vi } from 'vitest';
import { type AccessService, type AuditService, type EventStore } from '@aura/core';
import { CbsService } from './cbs.service';
import { InMemoryVariationStore } from './in-memory-variation-store';
import { VariationService } from './variation.service';
import type { ProjectService } from './project.service';

function fixture(options?: { cbs?: { get: ReturnType<typeof vi.fn> } }) {
  const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const projects = {
    get: vi.fn(async (id: string) => id === 'project-a' ? { id, tenantId: 'tenant-a', title: 'A', value: 100 } : null),
  } as unknown as ProjectService;
  const cbs = options?.cbs as unknown as CbsService | undefined;
  const service = new VariationService(new InMemoryVariationStore(), events, projects, access, null, audit, cbs ?? null);
  return { service, events, audit, access, projects };
}

describe('C6 change-control boundary', () => {
  it('requires a tenant-owned project and validates an optional CBS coding', async () => {
    const cbs = { get: vi.fn(async () => ({ id: 'cbs-a', tenantId: 'tenant-a', projectId: 'project-a' })) };
    const fx = fixture({ cbs });
    await expect(fx.service.create({ tenantId: 'tenant-b', projectId: 'project-a', title: 'Wrong tenant', type: 'addition', amount: 1 })).rejects.toThrow('project project-a not found');
    await expect(fx.service.create({ tenantId: 'tenant-a', projectId: 'project-a', cbsNodeId: 'cbs-a', title: 'Valid', type: 'addition', amount: 1 })).resolves.toMatchObject({ projectId: 'project-a' });
    expect(cbs.get).toHaveBeenCalledWith('cbs-a');
  });

  it('emits one audit/event per real transition and makes replay an immutable no-op', async () => {
    const fx = fixture();
    const vo = await fx.service.create({ tenantId: 'tenant-a', projectId: 'project-a', title: 'Approved change', type: 'addition', amount: 25, createdBy: 'maker' });
    await fx.service.changeStatus(vo.id, 'submitted', 'maker');
    await fx.service.changeStatus(vo.id, 'approved', 'checker');
    await fx.service.changeStatus(vo.id, 'approved', 'checker');
    expect(fx.events.append).toHaveBeenCalledTimes(3);
    expect((fx.audit.log as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);
    expect(fx.access.assert).toHaveBeenCalledWith('checker', expect.objectContaining({ permission: 'projects.variation.approve' }));
  });

  it('rejects terminal rewrites and converges duplicate approval races', async () => {
    const fx = fixture();
    const vo = await fx.service.create({ tenantId: 'tenant-a', projectId: 'project-a', title: 'Race', type: 'addition', amount: 10 });
    const results = await Promise.all([fx.service.changeStatus(vo.id, 'approved', 'a'), fx.service.changeStatus(vo.id, 'approved', 'b')]);
    expect(results.every((r) => r.status === 'approved')).toBe(true);
    await expect(fx.service.changeStatus(vo.id, 'draft', 'a')).rejects.toThrow('cannot move variation from approved');
  });

  it('rejects a conflicting decision race rather than silently overwriting approval', async () => {
    const fx = fixture();
    const vo = await fx.service.create({ tenantId: 'tenant-a', projectId: 'project-a', title: 'Conflict', type: 'addition', amount: 10 });
    const results = await Promise.allSettled([
      fx.service.changeStatus(vo.id, 'approved', 'a'),
      fx.service.changeStatus(vo.id, 'rejected', 'b'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});
