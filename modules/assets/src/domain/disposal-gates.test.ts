import { describe, it, expect } from 'vitest';
import {
  InMemoryAssetStore,
  InMemoryAssetMaintenanceStore,
  InMemoryAssetInspectionStore,
  InMemoryAssetDisposalStore,
} from '../in-memory-assets-store';
import { AssetsService } from '../assets.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';
import { ASSET_TRANSITIONS, canTransitionAsset } from './asset';

// G-08 residue (assets). The register is an accounting record, so the refusals here are about
// keeping it consistent with what Finance has already posted: an asset cannot leave the register
// while work is still booked against it, and a settled asset cannot keep depreciating.

const mockTx: TxRunner = { run: (fn) => fn(null) };
const mockEvents = { appendWithClient: async () => [] } as unknown as EventStore;
const permissiveAccess = { assert: () => {} } as unknown as AccessService;

function build(): AssetsService {
  return new AssetsService(
    new InMemoryAssetStore(),
    new InMemoryAssetMaintenanceStore(),
    new InMemoryAssetInspectionStore(),
    new InMemoryAssetDisposalStore(),
    mockEvents,
    mockTx,
    permissiveAccess,
  );
}

const newAsset = (svc: AssetsService, over: Record<string, unknown> = {}) =>
  svc.createAsset(null, {
    tenantId: 't1',
    name: 'Generator',
    serialNumber: `GEN-${Math.random().toString(36).slice(2, 8)}`,
    category: 'Plant',
    purchaseDate: '2026-01-01',
    purchaseCost: 100_000,
    ...over,
  });

const disposalInput = (assetId: string) => ({
  tenantId: 't1',
  assetId,
  method: 'sale' as const,
  disposalDate: '2026-08-01',
  proceeds: 40_000,
  bookValue: 35_000,
});

describe('asset state machine', () => {
  it('makes disposed terminal — the register is left once', () => {
    expect(ASSET_TRANSITIONS.disposed).toEqual([]);
    expect(canTransitionAsset('disposed', 'active')).toBe(false);
    expect(canTransitionAsset('active', 'disposed')).toBe(true);
    expect(canTransitionAsset('maintenance', 'active')).toBe(true);
  });
});

describe('disposal gate', () => {
  it('refuses disposal while maintenance is still open', async () => {
    const svc = build();
    const asset = await newAsset(svc);
    await svc.scheduleMaintenance(null, {
      tenantId: 't1',
      assetId: asset.id,
      date: '2026-07-15',
      description: 'Rewind alternator',
    });

    await expect(svc.disposeAsset(null, disposalInput(asset.id))).rejects.toThrow(
      /can only be disposed once its maintenance is complete \(1 still open\)/,
    );
  });

  it('allows disposal once the work is completed', async () => {
    const svc = build();
    const asset = await newAsset(svc);
    const job = await svc.scheduleMaintenance(null, {
      tenantId: 't1',
      assetId: asset.id,
      date: '2026-07-15',
      description: 'Rewind alternator',
    });
    await svc.completeMaintenance('t1', null, job.id, 4200);

    const disposal = await svc.disposeAsset(null, disposalInput(asset.id));
    expect(disposal.assetId).toBe(asset.id);
    expect((await svc.getAsset('t1', asset.id))?.status).toBe('disposed');
  });

  it('does not let another asset’s open maintenance block this one', async () => {
    const svc = build();
    const a = await newAsset(svc, { serialNumber: 'A-1' });
    const b = await newAsset(svc, { serialNumber: 'B-1' });
    await svc.scheduleMaintenance(null, {
      tenantId: 't1', assetId: a.id, date: '2026-07-15', description: 'Unrelated',
    });

    const disposal = await svc.disposeAsset(null, disposalInput(b.id));
    expect(disposal.assetId).toBe(b.id);
  });

  it('refuses a second disposal', async () => {
    const svc = build();
    const asset = await newAsset(svc);
    await svc.disposeAsset(null, disposalInput(asset.id));
    await expect(svc.disposeAsset(null, disposalInput(asset.id))).rejects.toThrow(/already disposed/);
  });
});

describe('asset status follows its maintenance', () => {
  it('moves to maintenance on schedule and back to active on the last completion', async () => {
    const svc = build();
    const asset = await newAsset(svc);
    expect(asset.status).toBe('active');

    const first = await svc.scheduleMaintenance(null, {
      tenantId: 't1', assetId: asset.id, date: '2026-07-15', description: 'Job A',
    });
    const second = await svc.scheduleMaintenance(null, {
      tenantId: 't1', assetId: asset.id, date: '2026-07-16', description: 'Job B',
    });
    expect((await svc.getAsset('t1', asset.id))?.status).toBe('maintenance');

    // One of two done — still out of service.
    await svc.completeMaintenance('t1', null, first.id, 100);
    expect((await svc.getAsset('t1', asset.id))?.status).toBe('maintenance');

    // Both done — back in service.
    await svc.completeMaintenance('t1', null, second.id, 200);
    expect((await svc.getAsset('t1', asset.id))?.status).toBe('active');
  });

  it('refuses to schedule work on a disposed asset', async () => {
    const svc = build();
    const asset = await newAsset(svc);
    await svc.disposeAsset(null, disposalInput(asset.id));

    await expect(
      svc.scheduleMaintenance(null, { tenantId: 't1', assetId: asset.id, date: '2026-09-01', description: 'Too late' }),
    ).rejects.toThrow(/not disposed/);
  });

  it('refuses to schedule work on an asset that does not exist', async () => {
    const svc = build();
    await expect(
      svc.scheduleMaintenance(null, { tenantId: 't1', assetId: 'ghost', date: '2026-09-01', description: 'x' }),
    ).rejects.toThrow(/not found/);
  });
});

describe('depreciation stops at disposal', () => {
  it('computes a schedule while the asset is live', async () => {
    const svc = build();
    const asset = await newAsset(svc);
    const schedule = await svc.depreciation('t1', asset.id, { usefulLifeMonths: 60 });
    expect(schedule).toBeTruthy();
  });

  it('refuses once the asset is disposed — its book value is already settled', async () => {
    const svc = build();
    const asset = await newAsset(svc);
    await svc.disposeAsset(null, disposalInput(asset.id));

    await expect(svc.depreciation('t1', asset.id, { usefulLifeMonths: 60 })).rejects.toThrow(
      /can only be computed for an asset that is not disposed/,
    );
  });
});
