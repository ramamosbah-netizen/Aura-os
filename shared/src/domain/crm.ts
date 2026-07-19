import { type Id, newId } from './id';
import { daysSince, hoursSince, isQuiet } from './attention-time';
import type { BuyingStage, PursuitDecision, PursuitDimensions } from './buying-journey';
import type { LeadQualificationDimensions } from './lead-qualification';
import type { ElvSector, ElvSystem, ProjectStage } from './elv-context';

/**
 * G8 — the full §5 lifecycle. `verified` (a real inquiry, not spam), `assigned` (routed to an
 * owner), `qualifying` (actively being assessed) slot between the original states; all three are
 * ACTIVE statuses, so every existing lead and every existing rule keeps working unchanged.
 */
export type LeadStatus =
  | 'new' | 'verified' | 'assigned' | 'contacted' | 'qualifying' | 'qualified'
  | 'nurturing' | 'disqualified' | 'converted';
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
  /** Who owns qualification of this lead (the Lead OS execution owner). */
  assignedTo: Id | null;
  /** When it was assigned — the clock the first-response SLA runs against. */
  assignedAt: string | null;
  /** G9 — when the assignee acknowledged the assignment (null = not yet accepted). */
  acceptedAt: string | null;
  /** The explicit first-response fact: when we first meaningfully engaged the lead.
   * SLA breach is only measurable because this is recorded (or derived from the first
   * Activity touch after assignment). Null ⇒ we have not responded yet. */
  firstRespondedAt: string | null;
  /** First-response SLA target in hours; null falls back to LEAD_ATTENTION.slaFirstResponseHours. */
  slaFirstResponseHours: number | null;
  /**
   * PROJECTION / compatibility cache of the next open follow-up's due date. Activity is the
   * long-term source of truth for follow-up work; leadAttention() takes the next-activity fact
   * as a DERIVED input (composed from the Activity stream) rather than reading this column, so
   * this never becomes a second competing work system.
   */
  nextActivityDue: string | null;
  /** Lineage: the opportunity this lead converted into. Set ⇒ the lead is terminal (converted)
   * and can never convert again — the "cannot convert twice" invariant reads this. */
  convertedOpportunityId: Id | null;
  convertedAt: string | null;
  /** Lineage: the Signal this lead was promoted from (null for directly-captured leads).
   * Preserves source attribution back up the acquisition chain: Signal → Lead → Opportunity. */
  signalId: Id | null;
  /** The account this lead was resolved to (at promote / qualification), or null until linked. */
  accountId: Id | null;
  /**
   * G3 — the qualification assessment (the eight 0–100 dimensions). Null/absent keys mean UNRATED,
   * never zero. The score and recommendation are NOT stored: they are pure functions of this map
   * (assessLeadQualification), so caching them would recreate the second-truth problem G2 removed
   * from opportunity.nextAction. The human's decision is the lead's `status`.
   */
  qualificationDimensions: LeadQualificationDimensions | null;
  /** The qualifier's reasoning behind the numbers. */
  qualificationNotes: string | null;
  /** Governance: a score with no author cannot be challenged. */
  qualificationAssessedAt: string | null;
  qualificationAssessedBy: Id | null;
  /**
   * G4 — what the job actually IS: requirement, ELV systems, sector, project, consultant/main
   * contractor, rough value, project stage, expected timeline. Flattened onto the Lead rather than
   * nested so it stays one row, one read, and every column is independently filterable.
   * See ElvCommercialContext for why consultant/mainContractor are text until G6.
   */
  requirement: string | null;
  systems: ElvSystem[] | null;
  sector: ElvSector | null;
  projectName: string | null;
  projectLocation: string | null;
  consultant: string | null;
  mainContractor: string | null;
  /** A lead-stage estimate, NOT a committed opportunity value. */
  estimatedValue: number | null;
  projectStage: ProjectStage | null;
  expectedTimeline: string | null;
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
  /** The SALESPERSON's confidence (§23) — always was the hand-set number. Stage probability is
   * derived from `stage` and the model's read is advisory; see forecast-category.ts. */
  winProbability: number; // 0 to 100
  /** Explicit forecast commitment call (PIPELINE/BEST_CASE/COMMIT). Null = derive from confidence. */
  forecastCategory: import('./forecast-category').ForecastCategory | null;
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
  /**
   * G5 — why we WON, required by the stage gate to enter `won` (§40.3). Losses teach you what to
   * fix; wins teach you what to repeat and how to price. The asymmetry of recording only one was
   * backwards.
   */
  winReason: string | null;
  /** Where the CUSTOMER is in their own buying process (vs. our sales stage). Misalignment = risk. */
  buyingStage: BuyingStage | null;
  /** The recorded Pursue / No-Pursue call (kept even when NO_PURSUE — never deleted). */
  pursuitDecision: PursuitDecision | null;
  /** 0–100 assessment score behind the decision. */
  pursuitScore: number | null;
  pursuitRationale: string | null;
  pursuitDecidedBy: string | null;
  pursuitDecidedAt: string | null;
  /** The per-dimension assessment (strategicFit, winability, …) behind the score. */
  pursuitDimensions: PursuitDimensions | null;
  /** §14 — the deal STRATEGY (need, criteria, differentiation, win strategy, …). All optional;
   * coverage is derived per read against deal size (winPlanCoverage), never stored or gated. */
  winPlan: import('./win-plan').WinPlan | null;
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
  assignedTo?: Id | null;
  assignedAt?: string | null;
  acceptedAt?: string | null;
  firstRespondedAt?: string | null;
  slaFirstResponseHours?: number | null;
  nextActivityDue?: string | null;
  convertedOpportunityId?: Id | null;
  convertedAt?: string | null;
  signalId?: Id | null;
  accountId?: Id | null;
  qualificationDimensions?: LeadQualificationDimensions | null;
  qualificationNotes?: string | null;
  qualificationAssessedAt?: string | null;
  qualificationAssessedBy?: Id | null;
  requirement?: string | null;
  systems?: ElvSystem[] | null;
  sector?: ElvSector | null;
  projectName?: string | null;
  projectLocation?: string | null;
  consultant?: string | null;
  mainContractor?: string | null;
  estimatedValue?: number | null;
  projectStage?: ProjectStage | null;
  expectedTimeline?: string | null;
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
    assignedTo: input.assignedTo ?? null,
    assignedAt: input.assignedAt ?? null,
    acceptedAt: input.acceptedAt ?? null,
    firstRespondedAt: input.firstRespondedAt ?? null,
    slaFirstResponseHours: input.slaFirstResponseHours ?? null,
    nextActivityDue: input.nextActivityDue ?? null,
    convertedOpportunityId: input.convertedOpportunityId ?? null,
    convertedAt: input.convertedAt ?? null,
    signalId: input.signalId ?? null,
    accountId: input.accountId ?? null,
    // Unassessed by default — which assessLeadQualification honestly reports as score 0 /
    // LOW confidence / REVIEW, rather than pretending a fresh lead has been judged.
    qualificationDimensions: input.qualificationDimensions ?? null,
    qualificationNotes: input.qualificationNotes ?? null,
    qualificationAssessedAt: input.qualificationAssessedAt ?? null,
    qualificationAssessedBy: input.qualificationAssessedBy ?? null,
    // Context is captured as it is learned — a lead phoned in with only a name is still a lead.
    requirement: input.requirement?.trim() ?? null,
    systems: input.systems ?? null,
    sector: input.sector ?? null,
    projectName: input.projectName?.trim() ?? null,
    projectLocation: input.projectLocation?.trim() ?? null,
    consultant: input.consultant?.trim() ?? null,
    mainContractor: input.mainContractor?.trim() ?? null,
    estimatedValue: input.estimatedValue ?? null,
    projectStage: input.projectStage ?? null,
    expectedTimeline: input.expectedTimeline?.trim() ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Statuses where a lead is still being actively worked and must obey lead attention. */
export const LEAD_ACTIVE_STATUSES: readonly LeadStatus[] = ['new', 'verified', 'assigned', 'contacted', 'qualifying', 'qualified'];
/** Terminal / parked statuses — exempt from attention (nurture is a deliberate hold,
 * converted & disqualified are done). */
export const LEAD_TERMINAL_STATUSES: readonly LeadStatus[] = ['nurturing', 'disqualified', 'converted'];
/** Statuses still awaiting qualification (drives QUALIFICATION_STALLED). */
const LEAD_PREQUALIFIED_STATUSES: readonly LeadStatus[] = ['new', 'verified', 'assigned', 'contacted', 'qualifying'];

/** One shared threshold set for lead attention (hours/days). Change here, change everywhere. */
export const LEAD_ATTENTION = {
  /** Default first-response SLA when a lead carries no explicit target. */
  slaFirstResponseHours: 24,
  /** Assigned but not acknowledged by the assignee within this many hours ⇒ ASSIGNMENT_NOT_ACCEPTED. */
  acceptanceHours: 8,
  /** No touch in this many days ⇒ STALE. */
  staleDays: 7,
  /** Still not qualified this many days after creation ⇒ QUALIFICATION_STALLED. */
  qualificationStalledDays: 21,
} as const;

export type LeadAttentionGap =
  | 'UNASSIGNED'
  | 'ASSIGNMENT_NOT_ACCEPTED'
  | 'SLA_BREACHED'
  | 'NO_NEXT_ACTIVITY'
  | 'FOLLOW_UP_OVERDUE'
  | 'STALE'
  | 'QUALIFICATION_STALLED';

export type LeadAttentionSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LeadAttention {
  /** True for new/contacted/qualified — nurture & disqualified are exempt. */
  active: boolean;
  /** Which discipline gaps are open (empty when healthy). */
  gaps: LeadAttentionGap[];
  /** Any gap on an active lead ⇒ surfaces under "Needs Attention". */
  needsAttention: boolean;
  /** Highest severity across the open gaps, or null when none. */
  severity: LeadAttentionSeverity | null;
}

/** Facts the predicate needs but cannot read itself — DERIVED from the Activity stream by the
 * caller (Activity is the source of truth for follow-up work), keeping shared free of module deps. */
export interface LeadActivityFacts {
  /** Most-recent activity touch on this lead (ISO), or null when never touched. */
  lastTouchIso?: string | null;
  /** Due date of the next open follow-up activity (ISO), or null when none is scheduled. */
  nextActivityDueIso?: string | null;
  /** When we first responded (ISO) — the explicit first-response fact for SLA. */
  firstRespondedIso?: string | null;
}

const GAP_SEVERITY: Record<LeadAttentionGap, LeadAttentionSeverity> = {
  SLA_BREACHED: 'HIGH',
  FOLLOW_UP_OVERDUE: 'HIGH',
  UNASSIGNED: 'MEDIUM',
  ASSIGNMENT_NOT_ACCEPTED: 'MEDIUM',
  STALE: 'MEDIUM',
  QUALIFICATION_STALLED: 'MEDIUM',
  NO_NEXT_ACTIVITY: 'LOW',
};
const SEVERITY_RANK: Record<LeadAttentionSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

/** The minimal lead shape the predicate reads. */
export interface LeadAttentionCandidate {
  status: string;
  assignedTo?: Id | null;
  assignedAt?: string | null;
  /** G9 — when the assignee ACKNOWLEDGED the assignment. Routing isn't ownership until accepted. */
  acceptedAt?: string | null;
  firstRespondedAt?: string | null;
  slaFirstResponseHours?: number | null;
  createdAt: string;
}

/**
 * **Lead attention** — the single deterministic source of truth for "which leads need work
 * now". Mirrors opportunityAttention(): terminal/parked leads are exempt; every active lead is
 * checked for assignment, first-response SLA, follow-up discipline, staleness and qualification
 * progress. Follow-up facts are passed in (derived from the Activity stream) so Activity stays
 * the one work system and shared imports no module. `now` is injectable for deterministic tests.
 */
export function leadAttention(
  lead: LeadAttentionCandidate,
  facts: LeadActivityFacts = {},
  now: Date = new Date(),
): LeadAttention {
  const active = (LEAD_ACTIVE_STATUSES as readonly string[]).includes(lead.status);
  if (!active) return { active, gaps: [], needsAttention: false, severity: null };

  const today = now.toISOString().slice(0, 10);
  const firstResponded = facts.firstRespondedIso ?? lead.firstRespondedAt ?? null;
  const gaps: LeadAttentionGap[] = [];

  if (!lead.assignedTo) gaps.push('UNASSIGNED');

  // G9 — the 7th §8 reason: routed to someone who never picked it up. A lead can be "assigned"
  // in the system and owned by nobody in reality; acceptance is the fact that closes that gap.
  if (lead.assignedTo && !lead.acceptedAt) {
    const elapsed = hoursSince(lead.assignedAt ?? null, now);
    if (elapsed !== null && elapsed >= LEAD_ATTENTION.acceptanceHours) gaps.push('ASSIGNMENT_NOT_ACCEPTED');
  }

  // SLA: assigned, not yet responded, and past the (per-lead or default) first-response window.
  if (lead.assignedTo && firstResponded === null) {
    const slaHours = lead.slaFirstResponseHours ?? LEAD_ATTENTION.slaFirstResponseHours;
    const elapsed = hoursSince(lead.assignedAt ?? null, now);
    if (elapsed !== null && elapsed >= slaHours) gaps.push('SLA_BREACHED');
  }

  const nextDue = facts.nextActivityDueIso ?? null;
  if (nextDue === null) gaps.push('NO_NEXT_ACTIVITY');
  else if (nextDue.slice(0, 10) < today) gaps.push('FOLLOW_UP_OVERDUE');

  const lastTouch = facts.lastTouchIso ?? null;
  if (isQuiet(lastTouch, LEAD_ATTENTION.staleDays, now)) gaps.push('STALE');

  if (
    (LEAD_PREQUALIFIED_STATUSES as readonly string[]).includes(lead.status) &&
    (daysSince(lead.createdAt, now) ?? 0) >= LEAD_ATTENTION.qualificationStalledDays
  ) {
    gaps.push('QUALIFICATION_STALLED');
  }

  const severity = gaps.reduce<LeadAttentionSeverity | null>((hi, g) => {
    const s = GAP_SEVERITY[g];
    return hi === null || SEVERITY_RANK[s] > SEVERITY_RANK[hi] ? s : hi;
  }, null);

  return { active, gaps, needsAttention: gaps.length > 0, severity };
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
  forecastCategory?: import('./forecast-category').ForecastCategory | null;
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
  winReason?: string | null;
  buyingStage?: BuyingStage | null;
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
    forecastCategory: input.forecastCategory ?? null,
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
    winReason: input.winReason?.trim() || null,
    buyingStage: input.buyingStage ?? null,
    pursuitDecision: null,
    pursuitScore: null,
    pursuitRationale: null,
    pursuitDecidedBy: null,
    pursuitDecidedAt: null,
    pursuitDimensions: null,
    winPlan: null,
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
 * G2 — the next action, DERIVED from the Activity stream by the caller (Activity is the one work
 * system; shared imports no module). Exactly mirrors LeadActivityFacts, which has always worked
 * this way — this closes the asymmetry where the Lead half of the CRM projected its next action
 * from Activity while the Opportunity half kept a second, hand-maintained truth.
 *
 * Passing no facts keeps the legacy column behaviour, so every existing caller is unaffected until
 * it opts in. Where facts ARE supplied they WIN: the columns become a projection/cache of the next
 * open activity, never a competing fact.
 */
export interface OpportunityActivityFacts {
  /** Subject of the next open activity — becomes the Next Action. */
  nextActionSubject?: string | null;
  /** Due date of the next open activity (ISO). */
  nextActionDueIso?: string | null;
  /** Assignee of the next open activity — the person the work is actually on. */
  nextActionOwnerId?: Id | null;
}

/** What the invariant resolved to — so callers can SHOW the same next action they were judged on. */
export interface ResolvedNextAction {
  subject: string | null;
  dueDate: string | null;
  ownerId: string | null;
  /** True when it came from the Activity stream rather than the legacy columns. */
  fromActivity: boolean;
}

/**
 * Resolve the next action for an opportunity: the next open Activity wins; the legacy columns are
 * the fallback for records with no scheduled activity yet. One place decides, so the predicate and
 * every read model agree on what the next action IS.
 */
export function resolveNextAction(opp: NextActionCandidate, facts: OpportunityActivityFacts = {}): ResolvedNextAction {
  const fromActivity = Boolean(facts.nextActionSubject ?? facts.nextActionDueIso);
  return {
    subject: facts.nextActionSubject ?? opp.nextAction ?? null,
    dueDate: facts.nextActionDueIso ?? opp.nextActionDueDate ?? null,
    // The activity's assignee owns the work; fall back to the deal owner.
    ownerId: facts.nextActionOwnerId ?? opp.ownerId ?? null,
    fromActivity,
  };
}

/**
 * The **Next-Action Invariant** — the single source of truth: every ACTIVE
 * opportunity must carry a Next Action + Due Date + Owner. Any missing piece —
 * or a past-due date — flags the deal as "Needs Attention". Won/lost deals are
 * terminal and never flagged. `now` is injectable for deterministic tests.
 *
 * G2: `facts` (the next open Activity) take precedence over the stored columns, so completing an
 * activity and scheduling the next one moves the invariant automatically. Owner stays the deal's
 * own `ownerId` for the no-owner gap — a deal with unassigned work is still an unowned deal.
 */
export function opportunityAttention(
  opp: NextActionCandidate,
  facts: OpportunityActivityFacts = {},
  now: Date = new Date(),
): OpportunityAttention {
  const active = (OPPORTUNITY_ACTIVE_STAGES as readonly string[]).includes(opp.stage);
  if (!active) return { active, gaps: [], needsAttention: false };
  const today = now.toISOString().slice(0, 10);
  const next = resolveNextAction(opp, facts);
  const gaps: NextActionGap[] = [];
  if (!next.subject || !next.subject.trim()) gaps.push('no-next-action');
  if (!opp.ownerId) gaps.push('no-owner');
  if (!next.dueDate) gaps.push('no-due-date');
  else if (next.dueDate.slice(0, 10) < today) gaps.push('overdue');
  return { active, gaps, needsAttention: gaps.length > 0 };
}

export const CRM_EVENT = {
  leadCreated: 'crm.lead.created',
  leadUpdated: 'crm.lead.updated',
  leadAssigned: 'crm.lead.assigned',
  leadConverted: 'crm.lead.converted',
  opportunityCreated: 'crm.opportunity.created',
  opportunityUpdated: 'crm.opportunity.updated',
  opportunityStageChanged: 'crm.opportunity.stage_changed',
} as const;
