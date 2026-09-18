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
  /** Who instructed it. Recorded so the approval can be refused to them: a variation changes what the
   * subcontract is worth, which is the ceiling every certification is measured against. */
  createdBy: Id | null;
  /** Who DECIDED it, either way, and when. `approvedBy` names one outcome; a rejection is a decision
   * somebody made, and it was anonymous and undated. */
  decidedBy: Id | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface NewSubcontractVariation {
  tenantId: Id;
  subcontractId: Id;
  reference: string;
  type: VariationType;
  amount: number;
  description?: string;
  createdBy?: Id | null;
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
    createdBy: input.createdBy ?? null,
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
  };
}

/** Signed value applied to the subcontract: +amount for additions, −amount for omissions. */
export function signedAmount(v: SubcontractVariation): number {
  return v.type === 'omission' ? -v.amount : v.amount;
}

/**
 * Approve the instruction — which ADDS its signed amount to the subcontract value, and so raises the
 * ceiling every future certification is measured against. That is why the raiser may not approve it,
 * a rule the service applies against the record.
 */
export function approveVariation(v: SubcontractVariation, approverId: Id): SubcontractVariation {
  if (v.status !== 'pending') throw new Error(`cannot approve from status ${v.status}`);
  if (!approverId) throw new Error('approverId is required');
  const now = new Date().toISOString();
  return { ...v, status: 'approved', approvedBy: approverId, decidedBy: approverId, decidedAt: now };
}

/**
 * Reject it. `decidedBy`/`decidedAt` are recorded for the same reason they are on an approval: a
 * rejection is a decision a person made, and it used to be anonymous and undated — the subcontractor
 * was told no by nobody in particular.
 */
export function rejectVariation(v: SubcontractVariation, rejectedBy: Id | null = null): SubcontractVariation {
  if (v.status !== 'pending') throw new Error(`cannot reject from status ${v.status}`);
  return { ...v, status: 'rejected', decidedBy: rejectedBy, decidedAt: new Date().toISOString() };
}

export const VARIATION_EVENT = {
  created: 'subcontracts.variation.created',
  approved: 'subcontracts.variation.approved',
} as const;
