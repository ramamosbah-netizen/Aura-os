import { type Id, newId } from './id';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'nurturing' | 'disqualified';
export type LeadSource = 'website' | 'referral' | 'campaign' | 'cold_call' | 'other';

export interface Lead {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  source: LeadSource | null;
  createdAt: string;
  updatedAt: string;
}

export type OpportunityStage = 'qualification' | 'proposal' | 'negotiation' | 'won' | 'lost';

export interface Opportunity {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  leadId: Id | null;
  /** The CRM account (client) this opportunity is for — reference + snapshot, the head
   * of the deal chain. Carried down to the auto-created tender → contract → project. */
  accountId: Id | null;
  accountName: string | null;
  title: string;
  value: number;
  stage: OpportunityStage;
  winProbability: number; // 0 to 100
  closeDate: string | null;
  /**
   * Whether winning this deal needs a Tender/Estimation. The deal chain is
   * OPTIONAL per deal: direct sales, AMC renewals, variations and service
   * contracts convert straight to a quotation — no tender is auto-created.
   */
  requiresTender: boolean;
  ownerId: Id | null;
  /** The next concrete step the owner committed to (shown on the pipeline card). */
  nextAction: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewLead {
  tenantId: Id;
  companyId?: Id | null;
  name: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: LeadStatus;
  source?: LeadSource | null;
}

export function makeLead(input: NewLead): Lead {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    name: input.name.trim(),
    companyName: input.companyName?.trim() ?? null,
    email: input.email?.trim() ?? null,
    phone: input.phone?.trim() ?? null,
    status: input.status ?? 'new',
    source: input.source ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface NewOpportunity {
  tenantId: Id;
  companyId?: Id | null;
  leadId?: Id | null;
  accountId?: Id | null;
  accountName?: string | null;
  title: string;
  value?: number;
  stage?: OpportunityStage;
  winProbability?: number;
  closeDate?: string | null;
  requiresTender?: boolean;
  ownerId?: Id | null;
  nextAction?: string | null;
}

export function makeOpportunity(input: NewOpportunity): Opportunity {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    leadId: input.leadId ?? null,
    accountId: input.accountId ?? null,
    accountName: input.accountName?.trim() || null,
    title: input.title.trim(),
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    stage: input.stage ?? 'qualification',
    winProbability: Number.isFinite(input.winProbability) ? Number(input.winProbability) : 20.0,
    closeDate: input.closeDate ?? null,
    requiresTender: input.requiresTender ?? true,
    ownerId: input.ownerId ?? null,
    nextAction: input.nextAction?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

export const CRM_EVENT = {
  leadCreated: 'crm.lead.created',
  leadUpdated: 'crm.lead.updated',
  opportunityCreated: 'crm.opportunity.created',
  opportunityUpdated: 'crm.opportunity.updated',
  opportunityStageChanged: 'crm.opportunity.stage_changed',
} as const;
