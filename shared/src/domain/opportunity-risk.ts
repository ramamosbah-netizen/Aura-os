import { type Id, newId } from './id';
import { type RiskImpact, type RiskLikelihood, type RiskSeverity, riskSeverity, worstSeverity } from './risk';

// Opportunity Risk register — the PERSISTED, editable counterpart to the derived AT_RISK health
// bands (S7 delivered health; this makes risk a first-class record you can own and mitigate).
// An explicit risk carries a likelihood × impact severity, an owner, a mitigation and a lifecycle.
//
// The severity ARITHMETIC now lives in `./risk`, because Projects computes severity the same way.
// The LIFECYCLE does not, and deliberately: a deal risk has no state for "it occurred", and moving
// this one into a file named generically would have pulled Projects onto CRM's process one helper
// at a time. What stays here is everything genuinely about an OPPORTUNITY — the record, its foreign
// key, a taxonomy describing threats to a sale, and the lifecycle with the rollups that read it.
//
// The arithmetic is re-exported below, so every existing import of this file resolves unchanged.

export type { RiskLikelihood, RiskImpact, RiskSeverity } from './risk';
export { RISK_SEVERITY_RANK, riskSeverity, worstSeverity } from './risk';

/**
 * The OPPORTUNITY risk lifecycle. Deliberately NOT in `./risk`.
 *
 * It has no word for a risk that OCCURRED, because a deal risk that lands ends the deal
 * conversation rather than opening a new record. Projects needs that word — a delivery risk that
 * lands becomes a live issue, and the register must tell that apart from "it went away" — so
 * Projects declares `ProjectRiskStatus` for itself instead of widening this one.
 *
 * Everything below depends on this lifecycle and therefore belongs to this register, not to the
 * shared arithmetic.
 */
export type RiskStatus = 'OPEN' | 'MITIGATING' | 'RESOLVED' | 'ACCEPTED';

/** Statuses where the risk is still live and weighs on the deal. */
export const RISK_OPEN_STATUSES: readonly RiskStatus[] = ['OPEN', 'MITIGATING'];

/** The shape the rollups below need. Structural, so a caller need not hold a whole risk. */
export interface RiskLike {
  severity: RiskSeverity;
  status: RiskStatus;
}

export const riskIsOpen = (r: RiskLike): boolean => (RISK_OPEN_STATUSES as readonly string[]).includes(r.status);

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

export function riskSummary(risks: readonly RiskLike[]): RiskSummary {
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
export function worstOpenSeverity(risks: readonly RiskLike[]): RiskSeverity | null {
  return worstSeverity(risks.filter(riskIsOpen).map((r) => r.severity));
}

export const CRM_RISK_EVENT = {
  added: 'crm.opportunity.risk_added',
  statusChanged: 'crm.opportunity.risk_status_changed',
} as const;
