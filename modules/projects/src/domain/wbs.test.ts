import { describe, expect, it } from 'vitest';
import { makeWbsNode, calculateEvm } from './wbs';
import { InMemoryWbsStore } from '../in-memory-wbs-store';
import { WbsService } from '../wbs.service';
import { AccessService, type EventStore } from '@aura/core';

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  append: async () => [],
} as unknown as EventStore;

describe('Projects WBS & EVM', () => {
  describe('WBS Node Initialization', () => {
    it('creates WbsNode with sane defaults and trims fields', () => {
      const node = makeWbsNode({
        tenantId: 't1',
        projectId: 'p1',
        code: '  1.0  ',
        title: '  Civil Works  ',
        plannedValue: 50000,
      });

      expect(node.code).toBe('1.0');
      expect(node.title).toBe('Civil Works');
      expect(node.plannedValue).toBe(50000);
      expect(node.progress).toBe(0);
      expect(node.earnedValue).toBe(0);
      expect(node.actualCost).toBe(0);
      expect(node.status).toBe('pending');
    });
  });

  describe('Recursive Hierarchy rollup', () => {
    it('aggregates PV, EV, and AC from child nodes up to parent nodes', async () => {
      const store = new InMemoryWbsStore();
      const service = new WbsService(store, mockEvents, mockAccess);

      // Create Parent Node
      const parent = await service.create({
        tenantId: 't1',
        projectId: 'p1',
        code: '1.0',
        title: 'Engineering Design',
      });

      // Create Child Node 1
      const child1 = await service.create({
        tenantId: 't1',
        projectId: 'p1',
        parentId: parent.id,
        code: '1.1',
        title: 'Architectural Draft',
        plannedValue: 20000,
      });

      // Create Child Node 2
      const child2 = await service.create({
        tenantId: 't1',
        projectId: 'p1',
        parentId: parent.id,
        code: '1.2',
        title: 'Structural Model',
        plannedValue: 30000,
      });

      // Check rolled up planned value on parent
      let rolledParent = await service.get(parent.id);
      expect(rolledParent?.plannedValue).toBe(50000);

      // Update progress of child 1 to 50%
      await service.updateProgress(child1.id, 50);

      // Check parent progress rolls up
      rolledParent = await service.get(parent.id);
      // child 1 earnedValue = 20000 * 50% = 10000
      // child 2 earnedValue = 0
      // parent total EV = 10000
      // parent total PV = 50000
      // parent progress = 10000 / 50000 = 20%
      expect(rolledParent?.progress).toBe(20);
      expect(rolledParent?.earnedValue).toBe(10000);

      // Record spend of 5000 on child 2
      await service.recordActualSpend(child2.id, 5000);

      // Check parent actualCost rolls up
      rolledParent = await service.get(parent.id);
      expect(rolledParent?.actualCost).toBe(5000);
    });
  });

  describe('Earned Value Management (EVM) Math', () => {
    it('correctly calculates CV, SV, CPI, and SPI', () => {
      // PV = 10000, EV = 8000, AC = 6000
      const evm = calculateEvm(10000, 8000, 6000);

      expect(evm.costVariance).toBe(2000); // 8000 - 6000 = +2000 (Under budget)
      expect(evm.scheduleVariance).toBe(-2000); // 8000 - 10000 = -2000 (Behind schedule)
      expect(evm.cpi).toBe(1.33); // 8000 / 6000
      expect(evm.spi).toBe(0.8); // 8000 / 10000
    });

    it('returns default 1.0 performance index when values are 0', () => {
      const evm = calculateEvm(0, 0, 0);
      expect(evm.cpi).toBe(1.0);
      expect(evm.spi).toBe(1.0);
    });
  });
});
