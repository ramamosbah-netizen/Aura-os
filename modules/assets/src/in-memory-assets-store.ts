import { type TxHandle } from '@aura/core';
import { type Asset } from './domain/asset';
import { type AssetMaintenance } from './domain/asset-maintenance';
import { type AssetInspection } from './domain/asset-inspection';
import { type AssetDisposal } from './domain/asset-disposal';
import { type AssetStore, type AssetMaintenanceStore, type AssetInspectionStore, type AssetDisposalStore } from './store.interface';

export class InMemoryAssetDisposalStore implements AssetDisposalStore {
  private readonly items = new Map<string, AssetDisposal>();

  async save(entity: AssetDisposal): Promise<void> {
    this.items.set(entity.id, { ...entity });
  }

  async findById(tenantId: string, id: string): Promise<AssetDisposal | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByTenant(tenantId: string): Promise<AssetDisposal[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({ ...item }));
  }
}

export class InMemoryAssetStore implements AssetStore {
  private readonly items = new Map<string, Asset>();

  async save(entity: Asset, client?: TxHandle | null): Promise<void> {
    this.items.set(entity.id, { ...entity });
  }

  async findById(tenantId: string, id: string): Promise<Asset | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async delete(tenantId: string, id: string, client?: TxHandle | null): Promise<void> {
    const item = this.items.get(id);
    if (item && item.tenantId === tenantId) {
      this.items.delete(id);
    }
  }

  async findByTenant(tenantId: string): Promise<Asset[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .map((item) => ({ ...item }));
  }
}

export class InMemoryAssetMaintenanceStore implements AssetMaintenanceStore {
  private readonly items = new Map<string, AssetMaintenance>();

  async save(entity: AssetMaintenance, client?: TxHandle | null): Promise<void> {
    this.items.set(entity.id, { ...entity });
  }

  async findById(tenantId: string, id: string): Promise<AssetMaintenance | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByTenant(tenantId: string): Promise<AssetMaintenance[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .map((item) => ({ ...item }));
  }
}

export class InMemoryAssetInspectionStore implements AssetInspectionStore {
  private readonly items = new Map<string, AssetInspection>();

  async save(entity: AssetInspection, client?: TxHandle | null): Promise<void> {
    this.items.set(entity.id, { ...entity });
  }

  async findById(tenantId: string, id: string): Promise<AssetInspection | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByTenant(tenantId: string): Promise<AssetInspection[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .map((item) => ({ ...item }));
  }
}
