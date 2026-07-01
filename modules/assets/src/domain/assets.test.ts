import { describe, expect, it } from 'vitest';
import { makeAsset } from './asset';
import { makeAssetMaintenance } from './asset-maintenance';
import { makeAssetInspection } from './asset-inspection';
import {
  InMemoryAssetStore,
  InMemoryAssetMaintenanceStore,
  InMemoryAssetInspectionStore,
  InMemoryAssetDisposalStore,
} from '../in-memory-assets-store';
import { AssetsService } from '../assets.service';
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

describe('Assets Bounded Context', () => {
  describe('Asset Entity', () => {
    it('creates an asset record correctly', () => {
      const a = makeAsset({
        tenantId: 't1',
        name: 'Generator 500kVA',
        serialNumber: 'gen-98765',
        category: 'Power Equipment',
        purchaseDate: '2026-01-10',
        purchaseCost: 75000,
        warrantyExpiry: '2028-01-10',
      });
      expect(a.name).toBe('Generator 500kVA');
      expect(a.serialNumber).toBe('GEN-98765');
      expect(a.status).toBe('active');
    });

    it('manages asset lifecycle via service', async () => {
      const assetStore = new InMemoryAssetStore();
      const maintenanceStore = new InMemoryAssetMaintenanceStore();
      const inspectionStore = new InMemoryAssetInspectionStore();

      const service = new AssetsService(assetStore, maintenanceStore, inspectionStore, new InMemoryAssetDisposalStore(), mockEvents, mockTx, mockAccess);

      const asset = await service.createAsset(null, {
        tenantId: 't1',
        name: 'Tower Crane L1',
        serialNumber: 'crane-54321',
        category: 'Heavy Machinery',
        purchaseDate: '2026-02-15',
        purchaseCost: 250000,
      });

      expect(asset.status).toBe('active');

      const listed = await service.listAssets('t1');
      expect(listed.length).toBe(1);
      expect(listed[0].id).toBe(asset.id);

      const deleted = await service.deleteAsset('t1', null, asset.id);
      expect(deleted).toBe(true);

      const afterDelete = await service.listAssets('t1');
      expect(afterDelete.length).toBe(0);
    });

    it('paginates asset list correctly', async () => {
      const assetStore = new InMemoryAssetStore();
      const maintenanceStore = new InMemoryAssetMaintenanceStore();
      const inspectionStore = new InMemoryAssetInspectionStore();

      const service = new AssetsService(assetStore, maintenanceStore, inspectionStore, new InMemoryAssetDisposalStore(), mockEvents, mockTx, mockAccess);

      await service.createAsset(null, {
        tenantId: 't1',
        name: 'Asset 1',
        serialNumber: 'SN-001',
        category: 'Machinery',
        purchaseDate: '2026-02-15',
        purchaseCost: 1000,
      });
      await service.createAsset(null, {
        tenantId: 't1',
        name: 'Asset 2',
        serialNumber: 'SN-002',
        category: 'Vehicles',
        purchaseDate: '2026-02-16',
        purchaseCost: 2000,
      });
      await service.createAsset(null, {
        tenantId: 't1',
        name: 'Asset 3',
        serialNumber: 'SN-003',
        category: 'Machinery',
        purchaseDate: '2026-02-17',
        purchaseCost: 3000,
      });

      const page1 = await service.listAssetsPaged({ tenantId: 't1' }, { limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(3);
      expect(page1.hasMore).toBe(true);

      const pageCategory = await service.listAssetsPaged({ tenantId: 't1', category: 'Machinery' }, { limit: 10, offset: 0 });
      expect(pageCategory.items.length).toBe(2);
      expect(pageCategory.items.every(item => item.category === 'Machinery')).toBe(true);
    });
  });

  describe('Asset Maintenance', () => {
    it('schedules and completes maintenance via service', async () => {
      const assetStore = new InMemoryAssetStore();
      const maintenanceStore = new InMemoryAssetMaintenanceStore();
      const inspectionStore = new InMemoryAssetInspectionStore();

      const service = new AssetsService(assetStore, maintenanceStore, inspectionStore, new InMemoryAssetDisposalStore(), mockEvents, mockTx, mockAccess);

      const m = await service.scheduleMaintenance(null, {
        tenantId: 't1',
        assetId: 'asset-1',
        date: '2026-07-15',
        description: 'Hydraulic oil and filter replacement',
        cost: 1500,
      });

      expect(m.status).toBe('scheduled');
      expect(m.cost).toBe(1500);

      const completed = await service.completeMaintenance('t1', null, m.id, 1650);
      expect(completed.status).toBe('completed');
      expect(completed.cost).toBe(1650);
    });
  });

  describe('Asset Inspections', () => {
    it('records asset inspections via service', async () => {
      const assetStore = new InMemoryAssetStore();
      const maintenanceStore = new InMemoryAssetMaintenanceStore();
      const inspectionStore = new InMemoryAssetInspectionStore();

      const service = new AssetsService(assetStore, maintenanceStore, inspectionStore, new InMemoryAssetDisposalStore(), mockEvents, mockTx, mockAccess);

      const ins = await service.recordInspection(null, {
        tenantId: 't1',
        assetId: 'asset-1',
        date: '2026-06-28',
        inspector: 'Safety Officer Mike',
        result: 'pass',
        notes: 'Visual structural checks complete. All safety tags current.',
      });

      expect(ins.result).toBe('pass');
      expect(ins.inspector).toBe('Safety Officer Mike');

      const list = await service.listInspections('t1');
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(ins.id);
    });
  });
});
