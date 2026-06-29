import { randomUUID } from 'node:crypto';

export interface AssetMaintenance {
  id: string;
  tenantId: string;
  companyId: string | null;
  assetId: string;
  date: string;
  description: string;
  cost: number;
  status: 'scheduled' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export function makeAssetMaintenance(input: {
  id?: string;
  tenantId: string;
  companyId?: string | null;
  assetId: string;
  date: string;
  description: string;
  cost?: number;
  status?: AssetMaintenance['status'];
  createdAt?: string;
  updatedAt?: string;
}): AssetMaintenance {
  if (!input.assetId) throw new Error('Asset ID is required');
  if (!input.date) throw new Error('Maintenance date is required');
  if (!input.description?.trim()) throw new Error('Maintenance description is required');

  return {
    id: input.id || randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId || null,
    assetId: input.assetId,
    date: input.date,
    description: input.description.trim(),
    cost: input.cost ?? 0.00,
    status: input.status || 'scheduled',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}
