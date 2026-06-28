import { randomUUID } from 'node:crypto';
import { type Id } from '@aura/shared';

export interface BOQ {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  createdAt: string;
  updatedAt: string;
}

export interface BOQItem {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  boqId: Id;
  itemCode: string; // e.g. "1.1", "1.1.2"
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  totalAmount: number;
  ifcGuid: string | null; // BIM Linkage
  createdAt: string;
  updatedAt: string;
}

export interface NewBOQ {
  tenantId: Id;
  companyId?: Id | null;
  tenderId: Id;
}

export interface NewBOQItem {
  tenantId: Id;
  companyId?: Id | null;
  boqId: Id;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  ifcGuid?: string | null;
}

export function makeBOQ(input: NewBOQ): BOQ {
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    tenderId: input.tenderId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function makeBOQItem(input: NewBOQItem): BOQItem {
  const qty = Number(input.quantity) || 0;
  const rate = Number(input.rate) || 0;

  if (qty < 0) throw new Error('Quantity cannot be negative');
  if (rate < 0) throw new Error('Rate cannot be negative');
  if (!input.itemCode.trim()) throw new Error('Item code is required');
  if (!input.description.trim()) throw new Error('Description is required');
  if (!input.unit.trim()) throw new Error('Unit is required');

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    boqId: input.boqId,
    itemCode: input.itemCode.trim(),
    description: input.description.trim(),
    unit: input.unit.trim(),
    quantity: qty,
    rate: rate,
    totalAmount: qty * rate,
    ifcGuid: input.ifcGuid || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
