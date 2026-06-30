import { type Id, newId } from '@aura/shared';

/**
 * Subcontract Variation — a change to a subcontract's value (an addition or omission), e.g. extra
 * work instructed or scope removed. pending → approved | rejected. On approval the signed amount
 * (+addition / −omission) is applied to the subcontract value. Mirrors project variation orders,
 * but scoped to a subcontract.
 */
export type VariationType = 'addition' | 'omission';
export type VariationStatus = 'pending' | 'approved' | 'rejected';

export interface SubcontractVariation {
  id: Id;
  tenantId: Id;
  subcontractId: Id;
  reference: string;
  type: VariationType;
  amount: number; // always positive; `type` carries the sign
  description: string;
  status: VariationStatus;
  approvedBy: Id | null;
  createdAt: string;
}

export interface NewSubcontractVariation {
  tenantId: Id;
  subcontractId: Id;
  reference: string;
  type: VariationType;
  amount: number;
  description?: string;
}

export function makeSubcontractVariation(input: NewSubcontractVariation): SubcontractVariation {
  if (!input.subcontractId) throw new Error('subcontractId is required');
  if (!input.reference?.trim()) throw new Error('reference is required');
  if (input.type !== 'addition' && input.type !== 'omission') throw new Error("type must be 'addition' or 'omission'");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');
  return {
    id: newId(),
    tenantId: input.tenantId,
    subcontractId: input.subcontractId,
    reference: input.reference.trim(),
    type: input.type,
    amount,
    description: input.description?.trim() || '',
    status: 'pending',
    approvedBy: null,
    createdAt: new Date().toISOString(),
  };
}

/** Signed value applied to the subcontract: +amount for additions, −amount for omissions. */
export function signedAmount(v: SubcontractVariation): number {
  return v.type === 'omission' ? -v.amount : v.amount;
}

export function approveVariation(v: SubcontractVariation, approverId: Id): SubcontractVariation {
  if (v.status !== 'pending') throw new Error(`cannot approve from status ${v.status}`);
  if (!approverId) throw new Error('approverId is required');
  return { ...v, status: 'approved', approvedBy: approverId };
}

export function rejectVariation(v: SubcontractVariation): SubcontractVariation {
  if (v.status !== 'pending') throw new Error(`cannot reject from status ${v.status}`);
  return { ...v, status: 'rejected' };
}

export const VARIATION_EVENT = {
  created: 'subcontracts.variation.created',
  approved: 'subcontracts.variation.approved',
} as const;
