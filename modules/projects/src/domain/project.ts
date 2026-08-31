import { type Id, newId } from '@aura/shared';
import type { HandoverSnapshot } from './handover';

// Projects domain — framework-free. A Project is the delivery/execution of a signed
// contract: the final link in the deal chain (CRM → Tender → Contract → Project). It
// REFERENCES the source contract AND the CRM account by id + name snapshots — the chain
// arrives at delivery still by reference, never a DB join.

export type ProjectStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type ProjectOrigin = 'commercial_handover' | 'internal' | 'legacy';

export interface Project {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  title: string;
  reference: string | null;
  /** The signed contract this project delivers — reference + snapshot. */
  contractId: Id | null;
  contractTitle: string | null;
  /** The CRM account (client), carried down the chain — reference + snapshot. */
  accountId: Id | null;
  accountName: string | null;
  status: ProjectStatus;
  /** Project budget (carried from the contract value). */
  value: number;
  origin: ProjectOrigin;
  /** Immutable Contract → Project handover identity and commercial lineage. */
  handoverId: Id | null;
  handoverSnapshotHash: string | null;
  handoverSnapshot: HandoverSnapshot | null;
  handoverLockedAt: string | null;
  sourceOpportunityId: Id | null;
  sourceTenderId: Id | null;
  commercialScopeRevisionId: Id | null;
  boqRevisionId: Id | null;
  estimateRevisionId: Id | null;
  acceptedQuotationId: Id | null;
  acceptedQuotationRevisionId: Id | null;
  commercialBaselineId: Id | null;
  originalContractValue: number | null;
  currency: string | null;
  awardAcceptanceType: 'quotation_acceptance' | 'tender_award' | 'manual' | null;
  awardAcceptanceEvidence: Record<string, unknown> | null;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewProject {
  tenantId: Id;
  companyId?: Id | null;
  title: string;
  reference?: string | null;
  contractId?: Id | null;
  contractTitle?: string | null;
  accountId?: Id | null;
  accountName?: string | null;
  status?: ProjectStatus;
  value?: number;
  origin?: ProjectOrigin;
  handoverId?: Id | null;
  handoverSnapshotHash?: string | null;
  handoverSnapshot?: HandoverSnapshot | null;
  handoverLockedAt?: string | null;
  sourceOpportunityId?: Id | null;
  sourceTenderId?: Id | null;
  commercialScopeRevisionId?: Id | null;
  boqRevisionId?: Id | null;
  estimateRevisionId?: Id | null;
  acceptedQuotationId?: Id | null;
  acceptedQuotationRevisionId?: Id | null;
  commercialBaselineId?: Id | null;
  originalContractValue?: number | null;
  currency?: string | null;
  awardAcceptanceType?: Project['awardAcceptanceType'];
  awardAcceptanceEvidence?: Record<string, unknown> | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeProject(input: NewProject): Project {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    title: input.title.trim(),
    reference: input.reference?.trim() || null,
    contractId: input.contractId ?? null,
    contractTitle: input.contractTitle ?? null,
    accountId: input.accountId ?? null,
    accountName: input.accountName ?? null,
    status: input.status ?? 'planned',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    origin: input.origin ?? (input.handoverLockedAt ? 'commercial_handover' : 'internal'),
    handoverId: input.handoverId ?? null,
    handoverSnapshotHash: input.handoverSnapshotHash ?? null,
    handoverSnapshot: input.handoverSnapshot ?? null,
    handoverLockedAt: input.handoverLockedAt ?? null,
    sourceOpportunityId: input.sourceOpportunityId ?? null,
    sourceTenderId: input.sourceTenderId ?? null,
    commercialScopeRevisionId: input.commercialScopeRevisionId ?? null,
    boqRevisionId: input.boqRevisionId ?? null,
    estimateRevisionId: input.estimateRevisionId ?? null,
    acceptedQuotationId: input.acceptedQuotationId ?? null,
    acceptedQuotationRevisionId: input.acceptedQuotationRevisionId ?? null,
    commercialBaselineId: input.commercialBaselineId ?? null,
    originalContractValue: input.originalContractValue ?? (Number.isFinite(input.value) ? Number(input.value) : null),
    currency: input.currency?.trim().toUpperCase() || null,
    awardAcceptanceType: input.awardAcceptanceType ?? null,
    awardAcceptanceEvidence: input.awardAcceptanceEvidence ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Projects events on the spine. */
export const PROJECT_EVENT = {
  created: 'projects.project.created',
  updated: 'projects.project.updated',
  started: 'projects.project.started',
  completed: 'projects.project.completed',
  costCommitted: 'projects.cost.committed',
  costActual: 'projects.cost.actual',
  budgetOverrun: 'projects.budget.overrun',
} as const;
