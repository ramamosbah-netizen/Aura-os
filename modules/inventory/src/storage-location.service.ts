import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_LOCATION_STORE, type StorageLocationStore } from './storage-location-store';
import { type StorageLocation, type LocationType, makeStorageLocation, setLocationActive } from './domain/storage-location';

/** Warehouse/bin location master — the register of where stock physically lives. */
@Injectable()
export class StorageLocationService {
  constructor(@Inject(STORAGE_LOCATION_STORE) private readonly store: StorageLocationStore) {}

  async create(params: {
    tenantId: string; companyId?: string | null; warehouse: string; binCode: string;
    description?: string | null; type?: LocationType; createdBy?: string | null;
  }): Promise<StorageLocation> {
    const loc = makeStorageLocation(params);
    await this.store.save(loc);
    return loc;
  }

  list(tenantId: string, filter?: { warehouse?: string; active?: boolean }): Promise<StorageLocation[]> {
    return this.store.list(tenantId, filter);
  }

  async setActive(id: string, tenantId: string, active: boolean): Promise<StorageLocation> {
    const loc = await this.store.find(id, tenantId);
    if (!loc) throw new Error(`not found: storage location ${id}`);
    const next = setLocationActive(loc, active);
    await this.store.save(next);
    return next;
  }
}
