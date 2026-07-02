import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type OrgLevel, makeEvent, type Page, type PageParams } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import QRCode from 'qrcode';
import { type Asset, makeAsset } from './domain/asset';
import { type AssetTag, makeAssetTag } from './domain/asset-tag';
import { type DepreciationSchedule, type DepreciationMethod, computeDepreciation } from './domain/depreciation';
import { type AssetMaintenance, makeAssetMaintenance } from './domain/asset-maintenance';
import { type AssetInspection, makeAssetInspection } from './domain/asset-inspection';
import { type AssetDisposal, type NewAssetDisposal, makeAssetDisposal, ASSET_DISPOSAL_EVENT } from './domain/asset-disposal';
import { type AssetStore, type AssetMaintenanceStore, type AssetInspectionStore, type AssetDisposalStore, type AssetFilter } from './store.interface';

export const ASSET_STORE = Symbol('ASSET_STORE');
export const ASSET_MAINTENANCE_STORE = Symbol('ASSET_MAINTENANCE_STORE');
export const ASSET_INSPECTION_STORE = Symbol('ASSET_INSPECTION_STORE');
export const ASSET_DISPOSAL_STORE = Symbol('ASSET_DISPOSAL_STORE');

export const ASSETS_EVENT = {
  assetCreated: 'assets.created',
  maintenanceScheduled: 'assets.maintenance.scheduled',
  maintenanceCompleted: 'assets.maintenance.completed',
  inspectionRecorded: 'assets.inspection.recorded',
  assetDisposed: ASSET_DISPOSAL_EVENT.disposed,
};

@Injectable()
export class AssetsService {
  private readonly logger = new Logger('AssetsControl');

  constructor(
    @Inject(ASSET_STORE) private readonly assetStore: AssetStore,
    @Inject(ASSET_MAINTENANCE_STORE) private readonly maintenanceStore: AssetMaintenanceStore,
    @Inject(ASSET_INSPECTION_STORE) private readonly inspectionStore: AssetInspectionStore,
    @Inject(ASSET_DISPOSAL_STORE) private readonly disposalStore: AssetDisposalStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  // ── Assets ────────────────────────────────────────────────────────────────

  async createAsset(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      name: string;
      serialNumber: string;
      category: string;
      purchaseDate: string;
      purchaseCost: number;
      status?: Asset['status'];
      warrantyExpiry?: string | null;
      nextCalibrationDate?: string | null;
      nextInspectionDate?: string | null;
    },
  ): Promise<Asset> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'assets.asset.create', orgPath });
    }

    const asset = makeAsset(input);
    const event = makeEvent({
      type: ASSETS_EVENT.assetCreated,
      tenantId: asset.tenantId,
      companyId: asset.companyId,
      actorId: actorId,
      aggregateType: 'assets.asset',
      aggregateId: asset.id,
      payload: { name: asset.name, serialNumber: asset.serialNumber, category: asset.category },
    });

    await this.tx.run(async (handle) => {
      await this.assetStore.save(asset, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Asset registered: ${asset.name} (S/N: ${asset.serialNumber})`);
    return asset;
  }

  async deleteAsset(tenantId: string, actorId: string | null, id: string): Promise<boolean> {
    const asset = await this.assetStore.findById(tenantId, id);
    if (!asset) throw new Error(`Asset with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (asset.companyId) orgPath.push({ level: 'company', id: asset.companyId });
      this.access.assert(actorId, { permission: 'assets.asset.delete', orgPath });
    }

    await this.tx.run(async (handle) => {
      await this.assetStore.setDeleted(tenantId, id, true, handle);
    });

    this.logger.log(`Asset soft-deleted: ${id}`);
    return true;
  }

  /** Undo a soft-delete; returns the restored asset. */
  async restoreAsset(tenantId: string, id: string): Promise<Asset> {
    await this.assetStore.setDeleted(tenantId, id, false);
    const restored = await this.assetStore.findById(tenantId, id);
    if (!restored) throw new Error(`Asset with ID ${id} not found`);
    this.logger.log(`Asset restored: ${id}`);
    return restored;
  }

  getAsset(tenantId: string, id: string): Promise<Asset | null> {
    return this.assetStore.findById(tenantId, id);
  }

  listAssets(tenantId: string): Promise<Asset[]> {
    return this.assetStore.findByTenant(tenantId);
  }

  listAssetsPaged(filter: AssetFilter, page: PageParams): Promise<Page<Asset>> {
    return this.assetStore.listPaged(filter, page);
  }

  // ── QR tags ─────────────────────────────────────────────────────────────────

  /** Printable QR tag for one asset: deep-link payload + rendered SVG label. */
  async getAssetQrTag(tenantId: string, id: string): Promise<{ tag: AssetTag; svg: string }> {
    const asset = await this.assetStore.findById(tenantId, id);
    if (!asset) throw new Error(`asset ${id} not found`);
    const tag = makeAssetTag(asset);
    const svg = await QRCode.toString(tag.payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    return { tag, svg };
  }

  /** Batch QR tags for label printing (missing ids are skipped, not fatal). */
  async getAssetQrTags(tenantId: string, ids: string[]): Promise<Array<{ tag: AssetTag; svg: string }>> {
    const out: Array<{ tag: AssetTag; svg: string }> = [];
    for (const id of ids) {
      const asset = await this.assetStore.findById(tenantId, id);
      if (!asset) continue;
      const tag = makeAssetTag(asset);
      out.push({ tag, svg: await QRCode.toString(tag.payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }) });
    }
    return out;
  }

  // ── Disposal ────────────────────────────────────────────────────────────────

  /**
   * Retire an asset: record the disposal (proceeds, book value → gain/loss), set the asset
   * status to 'disposed', and emit `assets.asset.disposed` for Finance to post to the GL.
   */
  async disposeAsset(actorId: string | null, input: NewAssetDisposal): Promise<AssetDisposal> {
    const asset = await this.assetStore.findById(input.tenantId, input.assetId);
    if (!asset) throw new Error(`asset ${input.assetId} not found`);
    if (asset.status === 'disposed') throw new Error(`asset ${input.assetId} is already disposed`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId ?? asset.companyId) orgPath.push({ level: 'company', id: (input.companyId ?? asset.companyId) as Id });
      this.access.assert(actorId, { permission: 'assets.asset.dispose', orgPath });
    }

    const disposal = makeAssetDisposal({ ...input, companyId: input.companyId ?? asset.companyId, assetName: input.assetName ?? asset.name, createdBy: actorId });
    const disposedAsset: Asset = { ...asset, status: 'disposed', updatedAt: new Date().toISOString() };
    const event = makeEvent({
      type: ASSETS_EVENT.assetDisposed,
      tenantId: disposal.tenantId,
      companyId: disposal.companyId,
      actorId,
      aggregateType: 'assets.asset',
      aggregateId: disposal.assetId,
      payload: { assetName: disposal.assetName, method: disposal.method, proceeds: disposal.proceeds, bookValue: disposal.bookValue, gainLoss: disposal.gainLoss },
    });

    await this.tx.run(async (handle) => {
      await this.disposalStore.save(disposal, handle);
      await this.assetStore.save(disposedAsset, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Asset disposed: ${disposal.assetName} via ${disposal.method} — proceeds ${disposal.proceeds}, gain/loss ${disposal.gainLoss}`);
    return disposal;
  }

  listDisposals(tenantId: string): Promise<AssetDisposal[]> {
    return this.disposalStore.findByTenant(tenantId);
  }

  /** Depreciation schedule + net book value for an asset (uses its cost + purchase date). */
  async depreciation(
    tenantId: string,
    id: string,
    params: { usefulLifeMonths: number; salvageValue?: number; method?: DepreciationMethod; asOf?: string },
  ): Promise<DepreciationSchedule> {
    const asset = await this.assetStore.findById(tenantId, id);
    if (!asset) throw new Error(`asset ${id} not found`);
    return computeDepreciation({
      cost: asset.purchaseCost,
      salvageValue: params.salvageValue,
      usefulLifeMonths: params.usefulLifeMonths,
      method: params.method,
      purchaseDate: asset.purchaseDate,
      asOf: params.asOf ?? new Date().toISOString().slice(0, 10),
    });
  }

  // ── Maintenance ────────────────────────────────────────────────────────────

  async scheduleMaintenance(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      assetId: string;
      date: string;
      description: string;
      cost?: number;
    },
  ): Promise<AssetMaintenance> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'assets.maintenance.create', orgPath });
    }

    const record = makeAssetMaintenance({ ...input, status: 'scheduled' });
    const event = makeEvent({
      type: ASSETS_EVENT.maintenanceScheduled,
      tenantId: record.tenantId,
      companyId: record.companyId,
      actorId: actorId,
      aggregateType: 'assets.maintenance',
      aggregateId: record.id,
      payload: { assetId: record.assetId, date: record.date, description: record.description },
    });

    await this.tx.run(async (handle) => {
      await this.maintenanceStore.save(record, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Maintenance scheduled for asset ${record.assetId} on ${record.date}: ${record.description}`);
    return record;
  }

  async completeMaintenance(
    tenantId: string,
    actorId: string | null,
    id: string,
    actualCost: number,
  ): Promise<AssetMaintenance> {
    const record = await this.maintenanceStore.findById(tenantId, id);
    if (!record) throw new Error(`Maintenance record with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (record.companyId) orgPath.push({ level: 'company', id: record.companyId });
      this.access.assert(actorId, { permission: 'assets.maintenance.update', orgPath });
    }

    record.status = 'completed';
    record.cost = actualCost;
    record.updatedAt = new Date().toISOString();

    const event = makeEvent({
      type: ASSETS_EVENT.maintenanceCompleted,
      tenantId: record.tenantId,
      companyId: record.companyId,
      actorId: actorId,
      aggregateType: 'assets.maintenance',
      aggregateId: record.id,
      payload: { assetId: record.assetId, cost: actualCost },
    });

    await this.tx.run(async (handle) => {
      await this.maintenanceStore.save(record, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Maintenance completed for asset record ${id}: Cost ${actualCost} AED`);
    return record;
  }

  listMaintenance(tenantId: string): Promise<AssetMaintenance[]> {
    return this.maintenanceStore.findByTenant(tenantId);
  }

  // ── Inspections ────────────────────────────────────────────────────────────

  async recordInspection(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      assetId: string;
      date: string;
      inspector: string;
      result: 'pass' | 'fail';
      notes?: string | null;
    },
  ): Promise<AssetInspection> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'assets.inspection.create', orgPath });
    }

    const ins = makeAssetInspection(input);
    const event = makeEvent({
      type: ASSETS_EVENT.inspectionRecorded,
      tenantId: ins.tenantId,
      companyId: ins.companyId,
      actorId: actorId,
      aggregateType: 'assets.inspection',
      aggregateId: ins.id,
      payload: { assetId: ins.assetId, date: ins.date, result: ins.result },
    });

    await this.tx.run(async (handle) => {
      await this.inspectionStore.save(ins, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Inspection recorded for asset ${ins.assetId} on ${ins.date}: Result: ${ins.result.toUpperCase()}`);
    return ins;
  }

  listInspections(tenantId: string): Promise<AssetInspection[]> {
    return this.inspectionStore.findByTenant(tenantId);
  }
}
