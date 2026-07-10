import { describe, it, expect } from 'vitest';
import {
  InMemoryAssetStore,
  InMemoryAssetMaintenanceStore,
  InMemoryAssetInspectionStore,
  InMemoryAssetDisposalStore,
} from '../in-memory-assets-store';
import { AssetsService } from '../assets.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

// Coverage for the assets verticals the QA volume flags as thin: the maintenance
// schedule→complete transition, inspections, and disposal — including the disposal
// state guard (no double-disposal) and the gain/loss math Finance posts from.

const mockTx: TxRunner = { run: (fn) => fn(null) };

function build(): { svc: AssetsService; emitted: Array<{ type: string; payload: Record<string, unknown> }> } {
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const events = {
    appendWithClient: async (_h: unknown, evts: Array<{ type: string; payload: Record<string, unknown> }>) => {
      emitted.push(...evts);
      return evts;
    },
  } as unknown as EventStore;
  const svc = new AssetsService(
    new InMemoryAssetStore(),
    new InMemoryAssetMaintenanceStore(),
    new InMemoryAssetInspectionStore(),
    new InMemoryAssetDisposalStore(),
    events,
    mockTx,
    new AccessService(),
  );
  return { svc, emitted };
}

const newAsset = (svc: AssetsService) =>
  svc.createAsset(null, {
    tenantId: 't1',
    name: 'Scissor Lift SL-12',
    serialNumber: 'sl-12-001',
    category: 'Access Equipment',
    purchaseDate: '2025-01-15',
    purchaseCost: 42000,
  });

describe('Maintenance schedule → complete', () => {
  it('schedules (emits scheduled event) then completes with the actual cost', async () => {
    const { svc, emitted } = build();
    const asset = await newAsset(svc);

    const rec = await svc.scheduleMaintenance(null, {
      tenantId: 't1', assetId: asset.id, date: '2026-08-01', description: 'Annual hydraulic service', cost: 1500,
    });
    expect(rec.status).toBe('scheduled');
    expect(emitted.some((e) => e.type.includes('maintenance') && e.type.includes('scheduled'))).toBe(true);

    const done = await svc.completeMaintenance('t1', null, rec.id, 1725);
    expect(done.status).toBe('completed');
    expect(done.cost).toBe(1725); // actual cost overwrites the estimate
    const completedEvt = emitted.find((e) => e.type.includes('maintenance') && e.type.includes('completed'));
    expect(completedEvt?.payload).toMatchObject({ assetId: asset.id, cost: 1725 });

    await expect(svc.completeMaintenance('t1', null, 'missing', 1)).rejects.toThrow(/not found/);
  });
});

describe('Inspections', () => {
  it('records pass/fail inspections with the result in the event payload', async () => {
    const { svc, emitted } = build();
    const asset = await newAsset(svc);
    const failed = await svc.recordInspection(null, {
      tenantId: 't1', assetId: asset.id, date: '2026-07-09', inspector: 'TPI Bureau', result: 'fail',
      notes: 'Load test failed at 80%',
    });
    expect(failed.result).toBe('fail');
    expect(emitted.find((e) => e.type.includes('inspection'))?.payload).toMatchObject({
      assetId: asset.id,
      result: 'fail',
    });
  });
});

describe('Disposal (state guard + gain/loss)', () => {
  it('disposes an active asset, books gain/loss, and blocks double-disposal', async () => {
    const { svc, emitted } = build();
    const asset = await newAsset(svc);

    const disposal = await svc.disposeAsset(null, {
      tenantId: 't1', assetId: asset.id, disposalDate: '2026-07-09',
      method: 'sale', proceeds: 18000, bookValue: 21000,
    });
    expect(disposal.gainLoss).toBe(-3000); // proceeds − book value: a loss
    expect(disposal.assetName).toBe('Scissor Lift SL-12'); // snapshot from the asset

    const after = (await svc.listAssets('t1')).find((a) => a.id === asset.id);
    expect(after?.status).toBe('disposed');
    expect(emitted.some((e) => e.type === 'assets.asset.disposed')).toBe(true);

    await expect(
      svc.disposeAsset(null, { tenantId: 't1', assetId: asset.id, disposalDate: '2026-07-10', method: 'scrap' }),
    ).rejects.toThrow(/already disposed/);
  });

  it('refuses to dispose an asset that does not exist in the tenant', async () => {
    const { svc } = build();
    await expect(
      svc.disposeAsset(null, { tenantId: 't1', assetId: 'ghost', disposalDate: '2026-07-09', method: 'scrap' }),
    ).rejects.toThrow(/not found/);
  });
});
