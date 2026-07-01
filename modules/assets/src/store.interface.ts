import { type TxHandle } from '@aura/core';
import { type Asset } from './domain/asset';
import { type AssetMaintenance } from './domain/asset-maintenance';
import { type AssetInspection } from './domain/asset-inspection';
import { type AssetDisposal } from './domain/asset-disposal';

export interface AssetStore {
  save(entity: Asset, client?: TxHandle | null): Promise<void>;
  findById(tenantId: string, id: string): Promise<Asset | null>;
  delete(tenantId: string, id: string, client?: TxHandle | null): Promise<void>;
  findByTenant(tenantId: string): Promise<Asset[]>;
}

export interface AssetMaintenanceStore {
  save(entity: AssetMaintenance, client?: TxHandle | null): Promise<void>;
  findById(tenantId: string, id: string): Promise<AssetMaintenance | null>;
  findByTenant(tenantId: string): Promise<AssetMaintenance[]>;
}

export interface AssetInspectionStore {
  save(entity: AssetInspection, client?: TxHandle | null): Promise<void>;
  findById(tenantId: string, id: string): Promise<AssetInspection | null>;
  findByTenant(tenantId: string): Promise<AssetInspection[]>;
}

export interface AssetDisposalStore {
  save(entity: AssetDisposal, client?: TxHandle | null): Promise<void>;
  findById(tenantId: string, id: string): Promise<AssetDisposal | null>;
  findByTenant(tenantId: string): Promise<AssetDisposal[]>;
}
