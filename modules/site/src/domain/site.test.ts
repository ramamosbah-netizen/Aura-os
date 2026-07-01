import { describe, expect, it } from 'vitest';
import { makeDailyReport } from './daily-report';
import { makeDelayLog } from './delay-log';
import { makeMaterialConsumption } from './material-consumption';
import {
  InMemoryDailyReportStore,
  InMemoryDelayLogStore,
  InMemoryMaterialConsumptionStore,
  InMemorySiteInstructionStore,
  InMemoryLabourAllocationStore,
} from '../in-memory-site-store';
import { SiteService } from '../site.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  appendWithClient: async () => [],
} as unknown as EventStore;

const mockTx: TxRunner = {
  run: (fn) => fn(null),
};

describe('Construction / Site Control Module Bounded Context', () => {
  describe('Daily Reports / Site Diary', () => {
    it('creates a new daily report in draft status', () => {
      const r = makeDailyReport({
        tenantId: 't1',
        projectId: 'p1',
        date: '2026-06-27',
        workDescription: 'Poured concrete for foundation slab 3B',
        manpowerCount: 15,
        equipmentCount: 4,
      });
      expect(r.date).toBe('2026-06-27');
      expect(r.workDescription).toBe('Poured concrete for foundation slab 3B');
      expect(r.status).toBe('draft');
      expect(r.manpowerCount).toBe(15);
      expect(r.equipmentCount).toBe(4);
    });

    it('manages daily reports through the service layer', async () => {
      const dailyReportStore = new InMemoryDailyReportStore();
      const delayLogStore = new InMemoryDelayLogStore();
      const materialStore = new InMemoryMaterialConsumptionStore();

      const service = new SiteService(
        dailyReportStore,
        delayLogStore,
        materialStore,
        new InMemorySiteInstructionStore(),
        new InMemoryLabourAllocationStore(),
        mockEvents,
        mockTx,
        mockAccess,
      );

      const r = await service.createDailyReport({
        tenantId: 't1',
        projectId: 'p1',
        date: '2026-06-27',
        workDescription: 'Laying steel reinforcement mesh',
        manpowerCount: 8,
      });

      expect(r.status).toBe('draft');

      const submitted = await service.submitDailyReport('t1', null, r.id);
      expect(submitted.status).toBe('submitted');
    });

    it('paginates daily reports correctly', async () => {
      const dailyReportStore = new InMemoryDailyReportStore();
      const delayLogStore = new InMemoryDelayLogStore();
      const materialStore = new InMemoryMaterialConsumptionStore();

      const service = new SiteService(
        dailyReportStore,
        delayLogStore,
        materialStore,
        new InMemorySiteInstructionStore(),
        new InMemoryLabourAllocationStore(),
        mockEvents,
        mockTx,
        mockAccess,
      );

      await service.createDailyReport({
        tenantId: 't1',
        projectId: 'p1',
        date: '2026-06-27',
        workDescription: 'Poured concrete for foundation slab 3B',
      });
      await service.createDailyReport({
        tenantId: 't1',
        projectId: 'p1',
        date: '2026-06-28',
        workDescription: 'Laying steel mesh',
      });
      await service.createDailyReport({
        tenantId: 't1',
        projectId: 'p2',
        date: '2026-06-29',
        workDescription: 'Formwork inspection',
      });

      const page1 = await service.listDailyReportsPaged({ tenantId: 't1' }, { limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(3);
      expect(page1.hasMore).toBe(true);

      const pageProject = await service.listDailyReportsPaged({ tenantId: 't1', projectId: 'p2' }, { limit: 10, offset: 0 });
      expect(pageProject.items.length).toBe(1);
      expect(pageProject.items[0].projectId).toBe('p2');
    });
  });

  describe('Delay Logs', () => {
    it('logs and resolves delays', async () => {
      const dailyReportStore = new InMemoryDailyReportStore();
      const delayLogStore = new InMemoryDelayLogStore();
      const materialStore = new InMemoryMaterialConsumptionStore();

      const service = new SiteService(
        dailyReportStore,
        delayLogStore,
        materialStore,
        new InMemorySiteInstructionStore(),
        new InMemoryLabourAllocationStore(),
        mockEvents,
        mockTx,
        mockAccess,
      );

      const log = await service.createDelayLog({
        tenantId: 't1',
        projectId: 'p1',
        date: '2026-06-27',
        delayType: 'weather',
        description: 'Heavy sandstorm preventing outdoor crane lifts',
        impactHours: 4.5,
      });

      expect(log.status).toBe('logged');
      expect(log.delayType).toBe('weather');
      expect(log.impactHours).toBe(4.5);

      const resolved = await service.resolveDelayLog('t1', null, log.id);
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedAt).not.toBeNull();
    });
  });

  describe('Material Consumption', () => {
    it('logs material consumption entries', async () => {
      const dailyReportStore = new InMemoryDailyReportStore();
      const delayLogStore = new InMemoryDelayLogStore();
      const materialStore = new InMemoryMaterialConsumptionStore();

      const service = new SiteService(
        dailyReportStore,
        delayLogStore,
        materialStore,
        new InMemorySiteInstructionStore(),
        new InMemoryLabourAllocationStore(),
        mockEvents,
        mockTx,
        mockAccess,
      );

      const entry = await service.createMaterialConsumption({
        tenantId: 't1',
        projectId: 'p1',
        date: '2026-06-27',
        itemId: 'steel-rebar-16mm',
        itemName: '16mm High-Tensile Steel Rebar',
        quantityConsumed: 2.5,
        unit: 'tons',
      });

      expect(entry.itemId).toBe('steel-rebar-16mm');
      expect(entry.quantityConsumed).toBe(2.5);
      expect(entry.unit).toBe('tons');
    });
  });
});
