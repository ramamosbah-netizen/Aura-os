import { describe, expect, it } from 'vitest';
import { InMemoryResourcePlanningStore } from './in-memory-resource-planning-store';
import { ResourcePlanningService } from './resource-planning.service';

describe('ResourcePlanningService', () => {
  it('creates a tenant-owned pool and capacity with one measurement contract', async () => {
    const service = new ResourcePlanningService(new InMemoryResourcePlanningStore());
    const pool = await service.createPool({ tenantId: 'tenant-a', name: 'ELV installation crew', unit: 'crews', createdBy: 'manager' });
    const capacity = await service.createCapacity({
      tenantId: 'tenant-a', resource: { resourceType: 'pool', canonicalResourceId: pool.id },
      unit: 'crews', quantity: 2, from: '2026-09-20', to: '2026-10-20', createdBy: 'manager',
    });

    expect(await service.listPools('tenant-a')).toEqual([expect.objectContaining({ id: pool.id, name: 'ELV installation crew' })]);
    expect(await service.listPools('tenant-b')).toEqual([]);
    expect(await service.listCapacity('tenant-a', capacity.resource)).toEqual([expect.objectContaining({ id: capacity.id, quantity: 2 })]);
  });

  it('refuses cross-tenant and unit-spoofed capacity for a pool', async () => {
    const service = new ResourcePlanningService(new InMemoryResourcePlanningStore());
    const pool = await service.createPool({ tenantId: 'tenant-a', name: 'Commissioning team', unit: 'persons' });
    const input = { resource: { resourceType: 'pool' as const, canonicalResourceId: pool.id }, unit: 'persons' as const, quantity: 3, from: '2026-09-20', to: '2026-09-21' };

    await expect(service.createCapacity({ tenantId: 'tenant-b', ...input })).rejects.toThrow('not found in this tenant');
    await expect(service.createCapacity({ tenantId: 'tenant-a', ...input, unit: 'hours' })).rejects.toThrow('measured in persons');
  });
});
