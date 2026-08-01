import type { StorageLocation } from './domain/storage-location';

export const STORAGE_LOCATION_STORE = Symbol('STORAGE_LOCATION_STORE');

export interface StorageLocationStore {
  save(loc: StorageLocation): Promise<void>;
  find(id: string, tenantId: string): Promise<StorageLocation | null>;
  list(tenantId: string, filter?: { warehouse?: string; active?: boolean }): Promise<StorageLocation[]>;
}
