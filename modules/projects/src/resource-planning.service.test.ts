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

  it('keeps a pool’s roster separate from its capacity', async () => {
    const service = new ResourcePlanningService(new InMemoryResourcePlanningStore());
    const pool = await service.createPool({ tenantId: 'tenant-a', name: 'ELV installation crew', unit: 'crews' });
    // Two crews of capacity and twelve people on the roster is an ordinary arrangement, not a
    // contradiction: nothing derives either number from the other.
    await service.createCapacity({
      tenantId: 'tenant-a', resource: { resourceType: 'pool', canonicalResourceId: pool.id },
      unit: 'crews', quantity: 2, from: '2026-09-20', to: '2026-10-20',
    });
    const maya = await service.addPoolMember({ tenantId: 'tenant-a', poolId: pool.id, employeeId: 'emp-maya', addedBy: 'manager' });
    await service.addPoolMember({ tenantId: 'tenant-a', poolId: pool.id, employeeId: 'emp-sami' });

    expect((await service.listPoolMembers('tenant-a', pool.id)).map((m) => m.employeeId)).toEqual(['emp-maya', 'emp-sami']);
    expect(maya.addedBy).toBe('manager');
    expect((await service.listCapacity('tenant-a', { resourceType: 'pool', canonicalResourceId: pool.id }))[0].quantity).toBe(2);
    expect((await service.listPoolsForEmployee('tenant-a', 'emp-maya')).map((m) => m.poolId)).toEqual([pool.id]);

    // One active membership per person per pool.
    await expect(service.addPoolMember({ tenantId: 'tenant-a', poolId: pool.id, employeeId: 'emp-maya' }))
      .rejects.toThrow('already a member');

    // Removing takes them off the current roster and leaves the capacity untouched.
    await service.removePoolMember({ tenantId: 'tenant-a', poolId: pool.id, memberId: maya.id, removedBy: 'manager' });
    expect((await service.listPoolMembers('tenant-a', pool.id)).map((m) => m.employeeId)).toEqual(['emp-sami']);
    expect(await service.listPoolsForEmployee('tenant-a', 'emp-maya')).toEqual([]);
    expect((await service.listCapacity('tenant-a', { resourceType: 'pool', canonicalResourceId: pool.id }))[0].quantity).toBe(2);

    // …and the same person can rejoin afterwards.
    await expect(service.addPoolMember({ tenantId: 'tenant-a', poolId: pool.id, employeeId: 'emp-maya' })).resolves.toBeTruthy();
    await expect(service.removePoolMember({ tenantId: 'tenant-a', poolId: pool.id, memberId: maya.id }))
      .rejects.toThrow('already been removed');
  });

  it('refuses a membership on another tenant’s pool, or in the wrong pool', async () => {
    const service = new ResourcePlanningService(new InMemoryResourcePlanningStore());
    const pool = await service.createPool({ tenantId: 'tenant-a', name: 'Commissioning team', unit: 'persons' });
    const other = await service.createPool({ tenantId: 'tenant-a', name: 'Testing team', unit: 'persons' });

    await expect(service.addPoolMember({ tenantId: 'tenant-b', poolId: pool.id, employeeId: 'emp-maya' }))
      .rejects.toThrow('not found in this tenant');
    const member = await service.addPoolMember({ tenantId: 'tenant-a', poolId: pool.id, employeeId: 'emp-maya' });
    // The membership id alone must not be enough: it has to belong to the pool in the URL.
    await expect(service.removePoolMember({ tenantId: 'tenant-a', poolId: other.id, memberId: member.id }))
      .rejects.toThrow('not found in this pool');
    await expect(service.removePoolMember({ tenantId: 'tenant-b', poolId: pool.id, memberId: member.id }))
      .rejects.toThrow('not found in this pool');
    expect(await service.listPoolsForEmployee('tenant-b', 'emp-maya')).toEqual([]);
  });

  it('refuses cross-tenant and unit-spoofed capacity for a pool', async () => {
    const service = new ResourcePlanningService(new InMemoryResourcePlanningStore());
    const pool = await service.createPool({ tenantId: 'tenant-a', name: 'Commissioning team', unit: 'persons' });
    const input = { resource: { resourceType: 'pool' as const, canonicalResourceId: pool.id }, unit: 'persons' as const, quantity: 3, from: '2026-09-20', to: '2026-09-21' };

    await expect(service.createCapacity({ tenantId: 'tenant-b', ...input })).rejects.toThrow('not found in this tenant');
    await expect(service.createCapacity({ tenantId: 'tenant-a', ...input, unit: 'hours' })).rejects.toThrow('measured in persons');
  });
});
