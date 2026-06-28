import { randomUUID } from 'node:crypto';

export interface MaterialConsumption {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string; // YYYY-MM-DD
  itemId: string;
  itemName: string;
  quantityConsumed: number;
  unit: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewMaterialConsumption {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  date: string;
  itemId: string;
  itemName: string;
  quantityConsumed: number;
  unit: string;
  createdBy?: string | null;
}

export function makeMaterialConsumption(input: NewMaterialConsumption): MaterialConsumption {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    date: input.date,
    itemId: input.itemId,
    itemName: input.itemName.trim(),
    quantityConsumed: input.quantityConsumed,
    unit: input.unit.trim(),
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
