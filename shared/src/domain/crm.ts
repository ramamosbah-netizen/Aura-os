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
  /** When that next step is due (ISO date). Part of the Next-Action Invariant. */
  nextActionDueDate: string | null;
  /** BANT qualification — how well we understand the deal (drives real probability). */
  budgetConfirmed: boolean;
  authorityConfirmed: boolean;
  needConfirmed: boolean;
  timelineConfirmed: boolean;
  /** Who else is bidding — freeform / comma-separated competitor names. */
  competitors: string | null;
  /** Where the opportunity came from (referral, existing client, campaign…). */
  source: string | null;
  /** Why we lost (win/loss intelligence) — set when the stage moves to lost. */
  lossReason: string | null;
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
  nextActionDueDate?: string | null;
  budgetConfirmed?: boolean;
  authorityConfirmed?: boolean;
  needConfirmed?: boolean;
  timelineConfirmed?: boolean;
  competitors?: string | null;
  source?: string | null;
  lossReason?: string | null;
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
    nextActionDueDate: input.nextActionDueDate ?? null,
    budgetConfirmed: input.budgetConfirmed ?? false,
    authorityConfirmed: input.authorityConfirmed ?? false,
    needConfirmed: input.needConfirmed ?? false,
    timelineConfirmed: input.timelineConfirmed ?? false,
    competitors: input.competitors?.trim() || null,
    source: input.source?.trim() || null,
    lossReason: input.lossReason?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Stages where a deal is still live and must obey the Next-Action Invariant. */
export const OPPORTUNITY_ACTIVE_STAGES: readonly OpportunityStage[] = ['qualification', 'proposal', 'negotiation'];

export type NextActionGap = 'no-next-action' | 'no-due-date' | 'no-owner' | 'overdue';

export interface OpportunityAttention {
  /** True for qualification/proposal/negotiation — won & lost are terminal. */
  active: boolean;
  /** Which parts of the Next-Action Invariant are unmet (empty when healthy). */
  gaps: NextActionGap[];
  /** Any gap on an active deal ⇒ surfaces under "Needs Attention". */
  needsAttention: boolean;
}

/** The minimal opportunity shape the invariant reads — lets the web client's
 * lean row type and the full domain entity share one predicate. */
export interface NextActionCandidate {
  stage: string;
  nextAction?: string | null;
  ownerId?: string | null;
  nextActionDueDate?: string | null;
}

/**
 * The **Next-Action Invariant** — the single source of truth: every ACTIVE
 * opportunity must carry a Next Action + Due Date + Owner. Any missing piece —
 * or a past-due date — flags the deal as "Needs Attention". Won/lost deals are
 * terminal and never flagged. `now` is injectable for deterministic tests.
 */
export function opportunityAttention(opp: NextActionCandidate, now: Date = new Date()): OpportunityAttention {
  const active = (OPPORTUNITY_ACTIVE_STAGES as readonly string[]).includes(opp.stage);
  if (!active) return { active, gaps: [], needsAttention: false };
  const today = now.toISOString().slice(0, 10);
  const gaps: NextActionGap[] = [];
  if (!opp.nextAction || !opp.nextAction.trim()) gaps.push('no-next-action');
  if (!opp.ownerId) gaps.push('no-owner');
  if (!opp.nextActionDueDate) gaps.push('no-due-date');
  else if (opp.nextActionDueDate.slice(0, 10) < today) gaps.push('overdue');
  return { active, gaps, needsAttention: gaps.length > 0 };
}

export const CRM_EVENT = {
  leadCreated: 'crm.lead.created',
  leadUpdated: 'crm.lead.updated',
  opportunityCreated: 'crm.opportunity.created',
  opportunityUpdated: 'crm.opportunity.updated',
  opportunityStageChanged: 'crm.opportunity.stage_changed',
} as const;
