import { type Id, newId } from './id';

// Opportunity execution depth (S4) — the three child collections that turn an Opportunity
// from a row into a deal command center: WHO is behind the deal (stakeholders), WHO on our
// side is working it (deal team), and WHAT was promised (commitments). Framework-free; each
// is scoped to one opportunity by reference. Deterministic derivations (stakeholder coverage,
// commitment attention) live here so API + UI + tests share one rule set.

// ─────────────────────────── Opportunity Stakeholder ───────────────────────────

export type StakeholderRole =
  | 'ECONOMIC_BUYER' | 'DECISION_MAKER' | 'CHAMPION' | 'INFLUENCER' | 'TECHNICAL_EVALUATOR'
  | 'PROCUREMENT' | 'FINANCE' | 'EXECUTIVE_SPONSOR' | 'END_USER' | 'CONSULTANT' | 'BLOCKER' | 'OTHER';

export type InfluenceLevel = 'low' | 'medium' | 'high';
export type Sentiment = 'champion' | 'supporter' | 'neutral' | 'skeptic' | 'blocker';

export interface OpportunityStakeholder {
  id: Id;
  tenantId: Id;
  opportunityId: Id;
  /** The person (CRM contact) — reference + name snapshot. */
  contactId: Id | null;
  contactName: string;
  role: StakeholderRole;
  influence: InfluenceLevel;
  /** Do they hold decision power on this deal? */
  decisionPower: boolean;
  sentiment: Sentiment;
  isChampion: boolean;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewOpportunityStakeholder {
  tenantId: Id;
  opportunityId: Id;
  contactId?: Id | null;
  contactName: string;
  role?: StakeholderRole;
  influence?: InfluenceLevel;
  decisionPower?: boolean;
  sentiment?: Sentiment;
  isChampion?: boolean;
  isPrimary?: boolean;
  notes?: string | null;
}

export function makeStakeholder(input: NewOpportunityStakeholder): OpportunityStakeholder {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    opportunityId: input.opportunityId,
    contactId: input.contactId ?? null,
    contactName: input.contactName.trim(),
    role: input.role ?? 'OTHER',
    influence: input.influence ?? 'medium',
    decisionPower: input.decisionPower ?? false,
    sentiment: input.sentiment ?? 'neutral',
    isChampion: input.isChampion ?? false,
    isPrimary: input.isPrimary ?? false,
    notes: input.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

export type StakeholderCoverageGap =
  | 'NO_STAKEHOLDERS' | 'NO_DECISION_MAKER' | 'NO_ECONOMIC_BUYER'
  | 'NO_CHAMPION' | 'SINGLE_THREADED_RELATIONSHIP' | 'BLOCKER_UNMANAGED';

export interface StakeholderCoverage {
  count: number;
  gaps: StakeholderCoverageGap[];
  /** 0–100 — how complete the buying-committee map is. */
  score: number;
  needsAttention: boolean;
}

/** Assess how well the buying committee is mapped for a deal. Deterministic + explainable. */
export function stakeholderCoverage(stakeholders: OpportunityStakeholder[]): StakeholderCoverage {
  const count = stakeholders.length;
  const gaps: StakeholderCoverageGap[] = [];
  if (count === 0) {
    return { count: 0, gaps: ['NO_STAKEHOLDERS'], score: 0, needsAttention: true };
  }
  const hasRole = (r: StakeholderRole): boolean => stakeholders.some((s) => s.role === r);
  const hasDecisionMaker = hasRole('DECISION_MAKER') || stakeholders.some((s) => s.decisionPower);
  const hasChampion = stakeholders.some((s) => s.isChampion || s.role === 'CHAMPION' || s.sentiment === 'champion');
  const blockerUnmanaged = stakeholders.some((s) => (s.role === 'BLOCKER' || s.sentiment === 'blocker'))
    && !hasChampion;

  if (!hasDecisionMaker) gaps.push('NO_DECISION_MAKER');
  if (!hasRole('ECONOMIC_BUYER')) gaps.push('NO_ECONOMIC_BUYER');
  if (!hasChampion) gaps.push('NO_CHAMPION');
  if (count === 1) gaps.push('SINGLE_THREADED_RELATIONSHIP');
  if (blockerUnmanaged) gaps.push('BLOCKER_UNMANAGED');

  // Score: start at 100, subtract for each material gap.
  const penalty: Record<StakeholderCoverageGap, number> = {
    NO_STAKEHOLDERS: 100, NO_DECISION_MAKER: 30, NO_ECONOMIC_BUYER: 25,
    NO_CHAMPION: 25, SINGLE_THREADED_RELATIONSHIP: 15, BLOCKER_UNMANAGED: 15,
  };
  const score = Math.max(0, 100 - gaps.reduce((s, g) => s + penalty[g], 0));
  return { count, gaps, score, needsAttention: gaps.length > 0 };
}

// ─────────────────────────── Opportunity Deal Team ───────────────────────────

export type DealTeamRole =
  | 'OWNER' | 'ACCOUNT_OWNER' | 'SALES_MANAGER' | 'PRESALES' | 'ESTIMATION'
  | 'PROCUREMENT' | 'FINANCE' | 'LEGAL' | 'EXECUTIVE_SPONSOR' | 'OTHER';

export interface OpportunityDealMember {
  id: Id;
  tenantId: Id;
  opportunityId: Id;
  userId: Id;
  userName: string | null;
  role: DealTeamRole;
  responsibility: string | null;
  active: boolean;
  joinedAt: string;
}

export interface NewOpportunityDealMember {
  tenantId: Id;
  opportunityId: Id;
  userId: Id;
  userName?: string | null;
  role?: DealTeamRole;
  responsibility?: string | null;
}

export function makeDealMember(input: NewOpportunityDealMember): OpportunityDealMember {
  return {
    id: newId(),
    tenantId: input.tenantId,
    opportunityId: input.opportunityId,
    userId: input.userId,
    userName: input.userName?.trim() || null,
    role: input.role ?? 'OTHER',
    responsibility: input.responsibility?.trim() || null,
    active: true,
    joinedAt: new Date().toISOString(),
  };
}

// ─────────────────────────── Commitment ───────────────────────────

export type CommitmentDirection = 'OURS' | 'THEIRS';
export type CommitmentStatus = 'OPEN' | 'FULFILLED' | 'BROKEN' | 'CANCELLED';

export interface Commitment {
  id: Id;
  tenantId: Id;
  /** What this promise is attached to — opportunity by default (reference + type). */
  relatedType: string;
  relatedId: Id;
  direction: CommitmentDirection;
  committedBy: string | null;
  committedTo: string | null;
  description: string;
  dueAt: string | null;
  status: CommitmentStatus;
  evidence: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewCommitment {
  tenantId: Id;
  relatedType?: string;
  relatedId: Id;
  direction: CommitmentDirection;
  committedBy?: string | null;
  committedTo?: string | null;
  description: string;
  dueAt?: string | null;
  evidence?: string | null;
}

export function makeCommitment(input: NewCommitment): Commitment {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    relatedType: input.relatedType ?? 'opportunity',
    relatedId: input.relatedId,
    direction: input.direction,
    committedBy: input.committedBy?.trim() || null,
    committedTo: input.committedTo?.trim() || null,
    description: input.description.trim(),
    dueAt: input.dueAt ?? null,
    status: 'OPEN',
    evidence: input.evidence?.trim() || null,
    fulfilledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function fulfilCommitment(c: Commitment, evidence?: string | null, at?: string): Commitment {
  if (c.status !== 'OPEN') throw new Error(`commitment is ${c.status} and cannot be fulfilled`);
  return {
    ...c,
    status: 'FULFILLED',
    fulfilledAt: at ?? new Date().toISOString(),
    evidence: evidence?.trim() || c.evidence,
    updatedAt: new Date().toISOString(),
  };
}

export function transitionCommitment(c: Commitment, to: 'BROKEN' | 'CANCELLED'): Commitment {
  if (c.status !== 'OPEN') throw new Error(`commitment is ${c.status} and cannot change to ${to}`);
  return { ...c, status: to, updatedAt: new Date().toISOString() };
}

/** An OPEN commitment past its due date — feeds opportunity attention & health. */
export function commitmentIsOverdue(c: Commitment, now: Date = new Date()): boolean {
  if (c.status !== 'OPEN' || !c.dueAt) return false;
  return c.dueAt.slice(0, 10) < now.toISOString().slice(0, 10);
}

export interface CommitmentSummary {
  open: number;
  overdue: number;
  fulfilled: number;
  broken: number;
  needsAttention: boolean;
}

export function commitmentSummary(commitments: Commitment[], now: Date = new Date()): CommitmentSummary {
  let open = 0, overdue = 0, fulfilled = 0, broken = 0;
  for (const c of commitments) {
    if (c.status === 'OPEN') { open++; if (commitmentIsOverdue(c, now)) overdue++; }
    else if (c.status === 'FULFILLED') fulfilled++;
    else if (c.status === 'BROKEN') broken++;
  }
  return { open, overdue, fulfilled, broken, needsAttention: overdue > 0 || broken > 0 };
}

export const CRM_OPPORTUNITY_DEPTH_EVENT = {
  stakeholderAdded: 'crm.opportunity.stakeholder_added',
  dealMemberAdded: 'crm.opportunity.deal_member_added',
  commitmentCreated: 'crm.commitment.created',
  commitmentFulfilled: 'crm.commitment.fulfilled',
  commitmentBroken: 'crm.commitment.broken',
} as const;
