import { type Id, newId } from '@aura/shared';

// ── Delay Analysis & Extension of Time (EOT) Claims ────────────────────────
// Tracks individual delay events and bundles them into formal EOT claim
// submissions to the employer for contract time extensions.

export type DelayCause = 'employer' | 'contractor' | 'neutral' | 'force_majeure';
export type DelayStatus = 'identified' | 'analysed' | 'submitted' | 'approved' | 'rejected';
export type EotStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'partially_approved' | 'rejected';

export interface DelayEvent {
  id: Id;
  tenantId: Id;
  projectId: Id;
  title: string;
  causeCategory: DelayCause;
  startDate: string;       // ISO date
  endDate: string | null;
  delayDays: number;
  isConcurrent: boolean;
  linkedActivityCode: string | null;  // WBS code cross-reference
  description: string | null;
  status: DelayStatus;
  createdAt: string;
}

export interface NewDelayEvent {
  tenantId: Id;
  projectId: Id;
  title: string;
  causeCategory?: DelayCause;
  startDate: string;
  endDate?: string | null;
  delayDays?: number;
  isConcurrent?: boolean;
  linkedActivityCode?: string | null;
  description?: string | null;
}

export function makeDelayEvent(input: NewDelayEvent): DelayEvent {
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    title: input.title.trim(),
    causeCategory: input.causeCategory ?? 'employer',
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    delayDays: Number.isFinite(input.delayDays) ? Number(input.delayDays) : 0,
    isConcurrent: input.isConcurrent ?? false,
    linkedActivityCode: input.linkedActivityCode ?? null,
    description: input.description ?? null,
    status: 'identified',
    createdAt: new Date().toISOString(),
  };
}

export interface EotClaim {
  id: Id;
  tenantId: Id;
  projectId: Id;
  claimNumber: number;
  title: string;
  submittedDays: number;
  approvedDays: number;
  status: EotStatus;
  justification: string | null;
  originalCompletionDate: string | null;
  revisedCompletionDate: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  /** IDs of linked delay events backing this claim. */
  delayEventIds: Id[];
  createdAt: string;
}

export interface NewEotClaim {
  tenantId: Id;
  projectId: Id;
  claimNumber: number;
  title: string;
  submittedDays: number;
  justification?: string | null;
  originalCompletionDate?: string | null;
  delayEventIds?: Id[];
}

export function makeEotClaim(input: NewEotClaim): EotClaim {
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    claimNumber: input.claimNumber,
    title: input.title.trim(),
    submittedDays: input.submittedDays,
    approvedDays: 0,
    status: 'draft',
    justification: input.justification ?? null,
    originalCompletionDate: input.originalCompletionDate ?? null,
    revisedCompletionDate: null,
    submittedAt: null,
    decidedAt: null,
    decidedBy: null,
    delayEventIds: input.delayEventIds ?? [],
    createdAt: new Date().toISOString(),
  };
}

/** Aggregate delay analysis metrics for a project. */
export interface DelayAnalysisSummary {
  totalDelayEvents: number;
  totalDelayDays: number;
  netDelayDays: number;        // non-concurrent only
  employerDays: number;
  contractorDays: number;
  neutralDays: number;
  forceMajeureDays: number;
  totalEotClaimed: number;
  totalEotApproved: number;
  pendingEotDays: number;
}

export function calculateDelayAnalysis(
  delays: DelayEvent[],
  eotClaims: EotClaim[],
): DelayAnalysisSummary {
  let totalDays = 0;
  let netDays = 0;
  let employer = 0;
  let contractor = 0;
  let neutral = 0;
  let fm = 0;

  for (const d of delays) {
    totalDays += d.delayDays;
    if (!d.isConcurrent) netDays += d.delayDays;
    switch (d.causeCategory) {
      case 'employer': employer += d.delayDays; break;
      case 'contractor': contractor += d.delayDays; break;
      case 'neutral': neutral += d.delayDays; break;
      case 'force_majeure': fm += d.delayDays; break;
    }
  }

  let totalClaimed = 0;
  let totalApproved = 0;
  for (const c of eotClaims) {
    totalClaimed += c.submittedDays;
    totalApproved += c.approvedDays;
  }

  return {
    totalDelayEvents: delays.length,
    totalDelayDays: totalDays,
    netDelayDays: netDays,
    employerDays: employer,
    contractorDays: contractor,
    neutralDays: neutral,
    forceMajeureDays: fm,
    totalEotClaimed: totalClaimed,
    totalEotApproved: totalApproved,
    pendingEotDays: totalClaimed - totalApproved,
  };
}
