import { randomUUID } from 'node:crypto';

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
