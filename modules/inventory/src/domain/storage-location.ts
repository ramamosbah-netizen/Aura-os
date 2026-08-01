import { randomUUID } from 'node:crypto';

// Inventory domain — framework-free. A StorageLocation is a physical place stock lives: a bin,
// rack, shelf, floor spot, yard or van, within a named warehouse/store. ELV contractors run
// several stores (main store, each site's container, engineers' vans); "which bin holds it" is
// how pickers and stock-counters actually find material. The bin-code register behind that.

export type LocationType = 'bin' | 'rack' | 'shelf' | 'floor' | 'yard' | 'van';

export const LOCATION_TYPES: LocationType[] = ['bin', 'rack', 'shelf', 'floor', 'yard', 'van'];

export interface StorageLocation {
  id: string;
  tenantId: string;
  companyId: string | null;
  warehouse: string;
  binCode: string;
  description: string | null;
  type: LocationType;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewStorageLocation {
  tenantId: string;
  companyId?: string | null;
  warehouse: string;
  binCode: string;
  description?: string | null;
  type?: LocationType;
  createdBy?: string | null;
}

function toType(v: unknown): LocationType {
  return (LOCATION_TYPES as string[]).includes(v as string) ? (v as LocationType) : 'bin';
}

export function makeStorageLocation(input: NewStorageLocation): StorageLocation {
  if (!input.warehouse?.trim()) throw new Error('warehouse is required');
  if (!input.binCode?.trim()) throw new Error('binCode is required');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    warehouse: input.warehouse.trim(),
    binCode: input.binCode.trim().toUpperCase(),
    description: input.description?.trim() || null,
    type: toType(input.type),
    active: true,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function setLocationActive(loc: StorageLocation, active: boolean): StorageLocation {
  return { ...loc, active, updatedAt: new Date().toISOString() };
}
