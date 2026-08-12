import { randomUUID } from 'node:crypto';

export type AssetStatus = 'active' | 'maintenance' | 'inactive' | 'disposed';

/**
 * Allowed status transitions. `disposed` is terminal — an asset leaves the register once, and the
 * disposal record is the accounting event that settles its book value. Resurrecting it would mean
 * a gain/loss already posted to the ledger no longer matches the register.
 *
 *   active ⇄ maintenance
 *      ⇅         ⇅
 *   inactive ────┴──→ disposed  (terminal)
 *
 * The gate that matters is in the service: disposal is refused while maintenance is still open on
 * the asset, because that work would otherwise post cost against something no longer owned.
 */
export const ASSET_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  active: ['maintenance', 'inactive', 'disposed'],
  maintenance: ['active', 'inactive', 'disposed'],
  inactive: ['active', 'maintenance', 'disposed'],
  disposed: [],
};

export class AssetTransitionError extends Error {
  constructor(from: AssetStatus, to: AssetStatus) {
    // "can only" so the API error taxonomy classifies this 409 CONFLICT, not 500.
    super(`an asset in '${from}' can only move to an allowed next state (attempted → '${to}')`);
    this.name = 'AssetTransitionError';
  }
}

export function canTransitionAsset(from: AssetStatus, to: AssetStatus): boolean {
  return ASSET_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertAssetTransition(from: AssetStatus, to: AssetStatus): void {
  if (!canTransitionAsset(from, to)) throw new AssetTransitionError(from, to);
}

export interface Asset {
  id: string;
  tenantId: string;
  companyId: string | null;
  name: string;
  serialNumber: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
  status: 'active' | 'maintenance' | 'inactive' | 'disposed';
  warrantyExpiry: string | null;
  nextCalibrationDate: string | null;
  nextInspectionDate: string | null;
  /** Soft-delete marker — deleted assets are hidden from finds but restorable. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function makeAsset(input: {
  id?: string;
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
  createdAt?: string;
  updatedAt?: string;
}): Asset {
  if (!input.name?.trim()) throw new Error('Asset name is required');
  if (!input.serialNumber?.trim()) throw new Error('Asset serial number is required');

  return {
    id: input.id || randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId || null,
    name: input.name.trim(),
    serialNumber: input.serialNumber.trim().toUpperCase(),
    category: input.category || 'General',
    purchaseDate: input.purchaseDate,
    purchaseCost: input.purchaseCost ?? 0.00,
    status: input.status || 'active',
    warrantyExpiry: input.warrantyExpiry || null,
    nextCalibrationDate: input.nextCalibrationDate || null,
    nextInspectionDate: input.nextInspectionDate || null,
    deletedAt: null,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}
