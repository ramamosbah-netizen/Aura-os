import { type Id, newId } from '@aura/shared';

// Tendering domain — framework-free. A Tender is a bid/proposal in response to a
// client opportunity: the second link in the deal chain (CRM → Tender → Contract →
// Project). It REFERENCES a CRM account by id + a name snapshot — never a DB join.

export type TenderStatus = 'draft' | 'submitted' | 'won' | 'lost';

export interface Tender {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  title: string;
  reference: string | null;
  /** The CRM account (client) this tender is for — reference + snapshot, not a join. */
  accountId: Id | null;
  accountName: string | null;
  status: TenderStatus;
  /** Estimated bid value. */
  value: number;
  /** Client submission deadline (YYYY-MM-DD) — the date the bid must be in. */
  submissionDeadline: string | null;
  /** Opportunity this tender was auto-created from (deal chain), reference not join. */
  sourceOpportunityId: Id | null;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewTender {
  tenantId: Id;
  companyId?: Id | null;
  title: string;
  reference?: string | null;
  accountId?: Id | null;
  accountName?: string | null;
  status?: TenderStatus;
  value?: number;
  submissionDeadline?: string | null;
  sourceOpportunityId?: Id | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeTender(input: NewTender): Tender {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    title: input.title.trim(),
    reference: input.reference?.trim() || null,
    accountId: input.accountId ?? null,
    accountName: input.accountName ?? null,
    status: input.status ?? 'draft',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    submissionDeadline: input.submissionDeadline ?? null,
    sourceOpportunityId: input.sourceOpportunityId ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Tendering events on the spine. */
export const TENDER_EVENT = {
  created: 'tendering.tender.created',
  updated: 'tendering.tender.updated',
  submitted: 'tendering.tender.submitted',
  awarded: 'tendering.tender.awarded',
  lost: 'tendering.tender.lost',
} as const;
