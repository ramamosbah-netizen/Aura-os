import { randomUUID } from 'node:crypto';

export interface AssetInspection {
  id: string;
  tenantId: string;
  companyId: string | null;
  assetId: string;
  date: string;
  inspector: string;
  result: 'pass' | 'fail';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function makeAssetInspection(input: {
  id?: string;
  tenantId: string;
  companyId?: string | null;
  assetId: string;
  date: string;
  inspector: string;
  result?: AssetInspection['result'];
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}): AssetInspection {
  if (!input.assetId) throw new Error('Asset ID is required');
  if (!input.date) throw new Error('Inspection date is required');
  if (!input.inspector?.trim()) throw new Error('Inspector name is required');

  return {
    id: input.id || randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId || null,
    assetId: input.assetId,
    date: input.date,
    inspector: input.inspector.trim(),
    result: input.result || 'pass',
    notes: input.notes || null,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}
