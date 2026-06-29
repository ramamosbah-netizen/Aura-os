import { describe, expect, it, vi } from 'vitest';
import { CbsService } from './cbs.service';
import type { CbsStore } from './cbs-store';
import type { EventStore } from '@aura/core';

describe('CbsService.syncFromBoq', () => {
  it('correctly creates and nests CBS nodes based on BOQ items', async () => {
    const projectId = 'proj-123';
    const tenantId = 'tenant-456';

    const dbNodes: any[] = [];
    const mockStore = {
      list: vi.fn(async (filter) => {
        let res = [...dbNodes];
        if (filter?.projectId) res = res.filter((n) => n.projectId === filter.projectId);
        if (filter?.parentId !== undefined) res = res.filter((n) => n.parentId === filter.parentId);
        return res;
      }),
      create: vi.fn(async (node) => {
        dbNodes.push(node);
        return node;
      }),
      update: vi.fn(async (node) => {
        const idx = dbNodes.findIndex((n) => n.id === node.id);
        if (idx !== -1) dbNodes[idx] = node;
      }),
      get: vi.fn(async (id) => dbNodes.find((n) => n.id === id) || null),
    } as unknown as CbsStore;

    const mockEvents = {
      append: vi.fn(),
    } as unknown as EventStore;

    const service = new CbsService(mockStore, mockEvents);

    const boqItems = [
      { itemCode: '1', description: 'Civil Works', unit: 'LS', quantity: 1, rate: 100000, totalAmount: 100000 },
      { itemCode: '1.1', description: 'Excavation', unit: 'm3', quantity: 1000, rate: 50, totalAmount: 50000 },
      { itemCode: '1.2', description: 'Concrete', unit: 'm3', quantity: 500, rate: 100, totalAmount: 50000 },
    ];

    await service.syncFromBoq(projectId, tenantId, boqItems);

    expect(dbNodes.length).toBe(3);

    const node1 = dbNodes.find((n) => n.code === '1');
    const node11 = dbNodes.find((n) => n.code === '1.1');
    const node12 = dbNodes.find((n) => n.code === '1.2');

    expect(node1).toBeDefined();
    expect(node11).toBeDefined();
    expect(node12).toBeDefined();

    expect(node1.budgetAmount).toBe(100000);
    expect(node11.budgetAmount).toBe(50000);
    expect(node12.budgetAmount).toBe(50000);

    expect(node1.parentId).toBeNull();
    expect(node11.parentId).toBe(node1.id);
    expect(node12.parentId).toBe(node1.id);
  });
});
