import { type Id, newId } from '@aura/shared';

/**
 * Variation Order (Change Order) — a contractual change to a project's scope/value: an
 * ADDITION (extra work, +value) or an OMISSION (descoped work, −value), carried through an
 * approval workflow. Approved variations adjust the project's revised contract value.
 */
export type VariationType = 'addition' | 'omission';
export type VariationStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface VariationOrder {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  projectTitle: string | null;
  reference: string | null;
  title: string;
  description: string | null;
  type: VariationType;
  amount: number; // positive magnitude
  signedAmount: number; // +amount for addition, −amount for omission
  status: VariationStatus;
  createdAt: string;
  createdBy: Id | null;
  decidedBy: Id | null;
  decidedAt: string | null;
}

export interface NewVariationOrder {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  projectTitle?: string | null;
  reference?: string | null;
  title: string;
  description?: string | null;
  type: VariationType;
  amount: number;
  createdBy?: Id | null;
}

export function makeVariationOrder(input: NewVariationOrder): VariationOrder {
  if (!input.title || !input.title.trim()) throw new Error('variation title is required');
  if (!input.projectId) throw new Error('projectId is required');
  if (input.type !== 'addition' && input.type !== 'omission') throw new Error("type must be 'addition' or 'omission'");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectTitle: input.projectTitle ?? null,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    type: input.type,
    amount,
    signedAmount: input.type === 'addition' ? amount : -amount,
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
    decidedBy: null,
    decidedAt: null,
  };
}

export interface VariationImpact {
  originalValue: number;
  approvedAdditions: number;
  approvedOmissions: number;
  netVariation: number;
  revisedValue: number;
  approvedCount: number;
  pendingCount: number;
}

/** Roll up variations against a project's original value into the revised contract value. */
export function variationImpact(originalValue: number, variations: VariationOrder[]): VariationImpact {
  let additions = 0;
  let omissions = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  for (const v of variations) {
    if (v.status === 'approved') {
      approvedCount += 1;
      if (v.type === 'addition') additions += v.amount;
      else omissions += v.amount;
    } else if (v.status === 'draft' || v.status === 'submitted') {
      pendingCount += 1;
    }
  }
  const net = additions - omissions;
  const round2 = (n: number): number => Number(n.toFixed(2));
  return {
    originalValue: round2(originalValue),
    approvedAdditions: round2(additions),
    approvedOmissions: round2(omissions),
    netVariation: round2(net),
    revisedValue: round2(originalValue + net),
    approvedCount,
    pendingCount,
  };
}

export const VARIATION_EVENT = {
  created: 'projects.variation.created',
  submitted: 'projects.variation.submitted',
  approved: 'projects.variation.approved',
  rejected: 'projects.variation.rejected',
} as const;
