import { type Id, newId } from './id';
import { type RiskImpact, type RiskLikelihood, type RiskSeverity, type RiskStatus, riskSeverity } from './risk';

// Opportunity Risk register — the PERSISTED, editable counterpart to the derived AT_RISK health
// bands (S7 delivered health; this makes risk a first-class record you can own and mitigate).
// An explicit risk carries a likelihood × impact severity, an owner, a mitigation and a lifecycle.
//
// The vocabulary and the arithmetic now live in `./risk`, because Projects speaks the same language
// about a different subject. What stays here is what is genuinely about an OPPORTUNITY: the record,
// its foreign key, and a type taxonomy whose members describe threats to a sale.
//
// Re-exported below so every existing import of this file keeps resolving unchanged.

export type {
  RiskLikelihood, RiskImpact, RiskSeverity, RiskStatus, RiskLike, RiskSummary,
} from './risk';
export {
  RISK_OPEN_STATUSES, RISK_SEVERITY_RANK, riskSeverity, riskIsOpen, riskSummary, worstOpenSeverity,
} from './risk';

/** What kind of threat this is — to a DEAL. Projects has its own taxonomy for threats to delivery. */
export type RiskType =
  | 'COMMERCIAL' | 'RELATIONSHIP' | 'COMPETITIVE' | 'TECHNICAL' | 'TIMELINE'
  | 'COMPLIANCE' | 'CUSTOMER' | 'DELIVERY' | 'OTHER';

export interface OpportunityRisk {
  id: Id;
  tenantId: Id;
  opportunityId: Id;
  type: RiskType;
  title: string;
  description: string | null;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  /** Derived from likelihood × impact — never set directly. */
  severity: RiskSeverity;
  evidence: string | null;
  owner: string | null;
  mitigation: string | null;
  targetDate: string | null;
  status: RiskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NewOpportunityRisk {
  tenantId: Id;
  opportunityId: Id;
  type?: RiskType;
  title: string;
  description?: string | null;
  likelihood?: RiskLikelihood;
  impact?: RiskImpact;
  evidence?: string | null;
  owner?: string | null;
  mitigation?: string | null;
  targetDate?: string | null;
}

export function makeRisk(input: NewOpportunityRisk): OpportunityRisk {
  const now = new Date().toISOString();
  const likelihood = input.likelihood ?? 'medium';
  const impact = input.impact ?? 'medium';
  return {
    id: newId(),
    tenantId: input.tenantId,
    opportunityId: input.opportunityId,
    type: input.type ?? 'OTHER',
    title: input.title.trim(),
    description: input.description?.trim() || null,
    likelihood,
    impact,
    severity: riskSeverity(likelihood, impact),
    evidence: input.evidence?.trim() || null,
    owner: input.owner?.trim() || null,
    mitigation: input.mitigation?.trim() || null,
    targetDate: input.targetDate ?? null,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
  };
}

/** Patch editable fields; severity is recomputed whenever likelihood/impact change. */
export function updateRisk(
  r: OpportunityRisk,
  patch: Partial<Pick<OpportunityRisk, 'type' | 'title' | 'description' | 'likelihood' | 'impact' | 'evidence' | 'owner' | 'mitigation' | 'targetDate'>>,
): OpportunityRisk {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next: OpportunityRisk = { ...r, ...defined, updatedAt: new Date().toISOString() };
  next.severity = riskSeverity(next.likelihood, next.impact);
  return next;
}

export function setRiskStatus(r: OpportunityRisk, status: RiskStatus): OpportunityRisk {
  return { ...r, status, updatedAt: new Date().toISOString() };
}

export const CRM_RISK_EVENT = {
  added: 'crm.opportunity.risk_added',
  statusChanged: 'crm.opportunity.risk_status_changed',
} as const;
