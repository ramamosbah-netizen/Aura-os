import { type Id, newId } from '@aura/shared';

// Contracts domain — framework-free. A Contract is the awarded engagement that follows
// a WON tender: the third link in the deal chain (CRM → Tender → Contract → Project).
// It REFERENCES the source tender AND the CRM account by id + name snapshots — carrying
// the chain down by value, never a DB join.

export type ContractStatus = 'draft' | 'active' | 'completed' | 'cancelled';

/**
 * Governed Contract lifecycle. Metadata updates are deliberately separate from
 * this transition boundary. Repeating the current state is an idempotent no-op;
 * terminal states cannot be rewritten.
 */
const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  draft: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function assertContractTransition(from: ContractStatus, to: ContractStatus): void {
  if (from === to) return;
  if (!CONTRACT_TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid contract transition: ${from} → ${to}`);
  }
}

export interface Contract {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  title: string;
  reference: string | null;
  /** The won tender this contract was awarded from — reference + snapshot. */
  tenderId: Id | null;
  tenderTitle: string | null;
  /** The CRM account (client), carried down the chain — reference + snapshot. */
  accountId: Id | null;
  accountName: string | null;
  status: ContractStatus;
  /** Awarded contract value. */
  value: number;
  /** Immutable commercial lineage captured at contract creation/signing. */
  sourceOpportunityId: Id | null;
  currency: string | null;
  commercialScopeRevisionId: Id | null;
  boqRevisionId: Id | null;
  estimateRevisionId: Id | null;
  acceptedQuotationId: Id | null;
  acceptedQuotationRevisionId: Id | null;
  awardAcceptanceType: 'quotation_acceptance' | 'tender_award' | 'manual' | null;
  awardAcceptanceEvidence: Record<string, unknown> | null;
  /** The locked Commercial Baseline (approved-price snapshot) this contract was created from —
   * reference, not join. Present when the contract came from an approved quotation (R3). */
  commercialBaselineId: Id | null;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewContract {
  tenantId: Id;
  companyId?: Id | null;
  title: string;
  reference?: string | null;
  tenderId?: Id | null;
  tenderTitle?: string | null;
  accountId?: Id | null;
  accountName?: string | null;
  status?: ContractStatus;
  value?: number;
  sourceOpportunityId?: Id | null;
  currency?: string | null;
  commercialScopeRevisionId?: Id | null;
  boqRevisionId?: Id | null;
  estimateRevisionId?: Id | null;
  acceptedQuotationId?: Id | null;
  acceptedQuotationRevisionId?: Id | null;
  awardAcceptanceType?: Contract['awardAcceptanceType'];
  awardAcceptanceEvidence?: Record<string, unknown> | null;
  commercialBaselineId?: Id | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeContract(input: NewContract): Contract {
  if (input.value === undefined || !Number.isFinite(input.value) || input.value < 0) {
    throw new Error('contract value must be a finite non-negative number; unavailable value must be rejected rather than defaulted to zero');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    title: input.title.trim(),
    reference: input.reference?.trim() || null,
    tenderId: input.tenderId ?? null,
    tenderTitle: input.tenderTitle ?? null,
    accountId: input.accountId ?? null,
    accountName: input.accountName ?? null,
    status: input.status ?? 'draft',
    value: Number(input.value),
    sourceOpportunityId: input.sourceOpportunityId ?? null,
    currency: input.currency?.trim().toUpperCase() || null,
    commercialScopeRevisionId: input.commercialScopeRevisionId ?? null,
    boqRevisionId: input.boqRevisionId ?? null,
    estimateRevisionId: input.estimateRevisionId ?? null,
    acceptedQuotationId: input.acceptedQuotationId ?? null,
    acceptedQuotationRevisionId: input.acceptedQuotationRevisionId ?? null,
    awardAcceptanceType: input.awardAcceptanceType ?? null,
    awardAcceptanceEvidence: input.awardAcceptanceEvidence ?? null,
    commercialBaselineId: input.commercialBaselineId ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Contracts events on the spine. */
export const CONTRACT_EVENT = {
  created: 'contracts.contract.created',
  updated: 'contracts.contract.updated',
  signed: 'contracts.contract.signed',
  completed: 'contracts.contract.completed',
} as const;
