import { type Id, newId } from '@aura/shared';
import type { HandoverSnapshot } from './handover';

// Projects domain — framework-free. A Project is the delivery/execution of a signed
// contract: the final link in the deal chain (CRM → Tender → Contract → Project). It
// REFERENCES the source contract AND the CRM account by id + name snapshots — the chain
// arrives at delivery still by reference, never a DB join.

/**
 * Every state a project can be in, in lifecycle order.
 *
 * The list lives here rather than in `project-lifecycle.ts` so that the TYPE and the MACHINE cannot
 * disagree: the lifecycle imports this, so a state the machine knows is a state the stored row is
 * allowed to hold, and vice versa. Adding one in a second place is the failure this shape prevents.
 *
 * `planned`, `active`, `completed` and `cancelled` are the originals and keep their meanings;
 * `planning`, `testing`, `handover` and `closeout` were previously folded into them. See
 * `project-lifecycle.ts` for what each transition is answerable for, and for why mobilization is
 * deliberately NOT here.
 */
export const PROJECT_STATES = [
  'planned',
  'planning',
  'active',
  'testing',
  'handover',
  'closeout',
  'completed',
  'cancelled',
] as const;

export type ProjectStatus = (typeof PROJECT_STATES)[number];

/**
 * The states a project may be CREATED in — before execution, where nothing has been gated yet.
 *
 * Reaching `active` or `completed` means passing a transition with conditions. Creation must not be
 * the way around them, or the gate would only apply to projects that were honest about their age.
 */
export const CREATABLE_STATES: readonly ProjectStatus[] = ['planned', 'planning'];
export type ProjectOrigin = 'commercial_handover' | 'internal' | 'legacy';

export interface WbsBaselineAllocation {
  nodeId: Id;
  code: string;
  title: string;
  plannedValue: number;
}

export interface WbsOpeningBaseline {
  baselineId: Id;
  approvedAt: string;
  approvedBy: Id;
  allocations: WbsBaselineAllocation[];
  originalBac: number;
}

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
  /** Identified, immutable opening BAC baseline; current BAC remains this value until rebaseline. */
  wbsBaselineId: Id | null;
  wbsBaselineApprovedAt: string | null;
  wbsBaselineApprovedBy: Id | null;
  wbsBaselineSnapshot: WbsOpeningBaseline | null;
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
  wbsBaselineId?: Id | null;
  wbsBaselineApprovedAt?: string | null;
  wbsBaselineApprovedBy?: Id | null;
  wbsBaselineSnapshot?: WbsOpeningBaseline | null;
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
    wbsBaselineId: input.wbsBaselineId ?? null,
    wbsBaselineApprovedAt: input.wbsBaselineApprovedAt ?? null,
    wbsBaselineApprovedBy: input.wbsBaselineApprovedBy ?? null,
    wbsBaselineSnapshot: input.wbsBaselineSnapshot ?? null,
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
  /**
   * Abandonment, with who and why attached. Separate from `updated` on purpose: a cancellation is
   * a decision someone made, and folding it into a generic field change would lose the person and
   * the reason — the two things anyone reading the history afterwards actually wants.
   */
  cancelled: 'projects.project.cancelled',
  completed: 'projects.project.completed',
  costCommitted: 'projects.cost.committed',
  costActual: 'projects.cost.actual',
  budgetOverrun: 'projects.budget.overrun',
} as const;
