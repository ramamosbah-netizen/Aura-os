import { describe, expect, it } from 'vitest';
import { makeAsset, assignAssetCustodian } from './asset';
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

    it('records who holds the asset, and refuses one that has left the register', () => {
      const asset = makeAsset({
        tenantId: 't1', name: 'Fluke tester', serialNumber: 'fl-1', category: 'Test equipment',
        purchaseDate: '2026-01-10', purchaseCost: 2500,
      });
      // Custody is handed over, never assumed at registration.
      expect(asset.custodianEmployeeId).toBeNull();

      const held = assignAssetCustodian(asset, ' emp-maya ');
      expect(held.custodianEmployeeId).toBe('emp-maya');
      // Re-stating the same holder writes nothing.
      expect(assignAssetCustodian(held, 'emp-maya')).toBe(held);
      // And it can be handed back.
      expect(assignAssetCustodian(held, null).custodianEmployeeId).toBeNull();
      expect(assignAssetCustodian(held, '   ').custodianEmployeeId).toBeNull();

      // A disposed asset has left the register; naming a holder would put a live responsibility
      // on somebody for a thing the company no longer owns.
      expect(() => assignAssetCustodian({ ...asset, status: 'disposed' }, 'emp-maya')).toThrow(/disposed/);
      expect(() => assignAssetCustodian({ ...asset, deletedAt: '2026-02-01T00:00:00.000Z' }, 'emp-maya')).toThrow(/deleted/);
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

      // Maintenance is scheduled against a real asset — the service now refuses a phantom id,
      // which is what keeps the disposal gate from being bypassed by referencing nothing.
      const asset = await service.createAsset(null, {
        tenantId: 't1',
        name: 'Excavator',
        serialNumber: 'EX-1',
        category: 'Plant',
        purchaseDate: '2026-01-01',
        purchaseCost: 250000,
      });

      const m = await service.scheduleMaintenance(null, {
        tenantId: 't1',
        assetId: asset.id,
        date: '2026-07-15',
        description: 'Hydraulic oil and filter replacement',
        cost: 1500,
      });

      expect(m.status).toBe('scheduled');
      expect(m.cost).toBe(1500);
      // Scheduling work takes the asset out of service.
      expect((await service.getAsset('t1', asset.id))?.status).toBe('maintenance');

      const completed = await service.completeMaintenance('t1', null, m.id, 1650);
      expect(completed.status).toBe('completed');
      expect(completed.cost).toBe(1650);
      // …and completing the last open job returns it.
      expect((await service.getAsset('t1', asset.id))?.status).toBe('active');
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
