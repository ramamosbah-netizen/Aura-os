import { type Id, newId } from './id';

// Opportunity Risk register — the PERSISTED, editable counterpart to the derived AT_RISK health
// bands (S7 delivered health; this makes risk a first-class record you can own and mitigate).
// An explicit risk carries a likelihood × impact severity, an owner, a mitigation and a lifecycle.
// Framework-free; deterministic severity + summary live here so API, UI, tests and the health
// engine share one rule set.

export type RiskType =
  | 'COMMERCIAL' | 'RELATIONSHIP' | 'COMPETITIVE' | 'TECHNICAL' | 'TIMELINE'
  | 'COMPLIANCE' | 'CUSTOMER' | 'DELIVERY' | 'OTHER';

export type RiskLikelihood = 'low' | 'medium' | 'high';
export type RiskImpact = 'low' | 'medium' | 'high';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskStatus = 'OPEN' | 'MITIGATING' | 'RESOLVED' | 'ACCEPTED';

/** Statuses where the risk is still live and weighs on the deal. */
export const RISK_OPEN_STATUSES: readonly RiskStatus[] = ['OPEN', 'MITIGATING'];

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

const RANK: Record<RiskLikelihood, number> = { low: 1, medium: 2, high: 3 };

/** likelihood × impact → severity (a 3×3 matrix). */
export function riskSeverity(likelihood: RiskLikelihood, impact: RiskImpact): RiskSeverity {
  const product = RANK[likelihood] * RANK[impact];
  if (product >= 9) return 'CRITICAL';
  if (product >= 6) return 'HIGH';
  if (product >= 3) return 'MEDIUM';
  return 'LOW';
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

export interface RiskSummary {
  total: number;
  /** OPEN or MITIGATING. */
  open: number;
  mitigating: number;
  /** Open risks at each high severity — the ones that should drive attention. */
  openCritical: number;
  openHigh: number;
  needsAttention: boolean;
}

const SEV_RANK: Record<RiskSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
export const riskIsOpen = (r: OpportunityRisk): boolean => (RISK_OPEN_STATUSES as readonly string[]).includes(r.status);

export function riskSummary(risks: OpportunityRisk[]): RiskSummary {
  let open = 0, mitigating = 0, openCritical = 0, openHigh = 0;
  for (const r of risks) {
    if (!riskIsOpen(r)) continue;
    open++;
    if (r.status === 'MITIGATING') mitigating++;
    if (r.severity === 'CRITICAL') openCritical++;
    else if (r.severity === 'HIGH') openHigh++;
  }
  return { total: risks.length, open, mitigating, openCritical, openHigh, needsAttention: openCritical + openHigh > 0 };
}

/** Highest open severity across a set — used to floor the health "risks" dimension. */
export function worstOpenSeverity(risks: OpportunityRisk[]): RiskSeverity | null {
  let worst: RiskSeverity | null = null;
  for (const r of risks) {
    if (!riskIsOpen(r)) continue;
    if (worst === null || SEV_RANK[r.severity] > SEV_RANK[worst]) worst = r.severity;
  }
  return worst;
}

export const CRM_RISK_EVENT = {
  added: 'crm.opportunity.risk_added',
  statusChanged: 'crm.opportunity.risk_status_changed',
} as const;
