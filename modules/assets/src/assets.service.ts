import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Asset, makeAsset } from './domain/asset';
import { type AssetMaintenance, makeAssetMaintenance } from './domain/asset-maintenance';
import { type AssetInspection, makeAssetInspection } from './domain/asset-inspection';
import { type AssetStore, type AssetMaintenanceStore, type AssetInspectionStore } from './store.interface';

export const ASSET_STORE = Symbol('ASSET_STORE');
export const ASSET_MAINTENANCE_STORE = Symbol('ASSET_MAINTENANCE_STORE');
export const ASSET_INSPECTION_STORE = Symbol('ASSET_INSPECTION_STORE');

export const ASSETS_EVENT = {
  assetCreated: 'assets.created',
  maintenanceScheduled: 'assets.maintenance.scheduled',
  maintenanceCompleted: 'assets.maintenance.completed',
  inspectionRecorded: 'assets.inspection.recorded',
};

@Injectable()
export class AssetsService {
  private readonly logger = new Logger('AssetsControl');

  constructor(
    @Inject(ASSET_STORE) private readonly assetStore: AssetStore,
    @Inject(ASSET_MAINTENANCE_STORE) private readonly maintenanceStore: AssetMaintenanceStore,
    @Inject(ASSET_INSPECTION_STORE) private readonly inspectionStore: AssetInspectionStore,
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
      await this.assetStore.delete(tenantId, id, handle);
    });

    this.logger.log(`Asset deleted: ${id}`);
    return true;
  }

  getAsset(tenantId: string, id: string): Promise<Asset | null> {
    return this.assetStore.findById(tenantId, id);
  }

  listAssets(tenantId: string): Promise<Asset[]> {
    return this.assetStore.findByTenant(tenantId);
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
