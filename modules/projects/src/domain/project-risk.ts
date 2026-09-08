import { type Id, newId, type RiskImpact, type RiskLikelihood, type RiskSeverity, type RiskStatus, riskSeverity } from '@aura/shared';

/**
 * §21 — the PROJECT risk register: an uncertain FUTURE event or condition that would threaten
 * delivery if it occurred.
 *
 * The language is the shared one (`@aura/shared` → `domain/risk`): likelihood × impact → severity,
 * and the OPEN → MITIGATING → RESOLVED / ACCEPTED lifecycle. CRM's opportunity risks speak it too.
 * What is NOT shared is storage: this register lives in its own table, because a schema change to
 * one module's risks must never be an outage in another's.
 *
 * What is also not shared is the taxonomy. `RiskType` in CRM describes threats to winning a deal
 * (RELATIONSHIP, COMPETITIVE, CUSTOMER); those cannot threaten a site. Delivery has its own areas,
 * below, named after the domains that would actually own the response.
 */

/**
 * Where a threat to delivery comes from — named after the domain that would have to answer it.
 *
 * Shared with `ProjectIssue`, deliberately: a procurement risk that occurs is a procurement issue,
 * and forcing a re-categorisation at materialisation would lose the connection between the two.
 */
export type ProjectDeliveryArea =
  | 'DESIGN' | 'PROCUREMENT' | 'SCHEDULE' | 'COST' | 'QUALITY' | 'SAFETY'
  | 'RESOURCE' | 'CLIENT' | 'AUTHORITY' | 'SUBCONTRACTOR' | 'INTERFACE' | 'OTHER';

export const PROJECT_DELIVERY_AREAS: readonly ProjectDeliveryArea[] = [
  'DESIGN', 'PROCUREMENT', 'SCHEDULE', 'COST', 'QUALITY', 'SAFETY',
  'RESOURCE', 'CLIENT', 'AUTHORITY', 'SUBCONTRACTOR', 'INTERFACE', 'OTHER',
];

export interface ProjectRisk {
  id: Id;
  tenantId: Id;
  projectId: Id;
  reference: string | null;
  title: string;
  description: string | null;
  area: ProjectDeliveryArea;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  /** Derived from likelihood × impact — never set directly. */
  severity: RiskSeverity;
  /** What is being done so this does not happen. Absent is a legitimate state; it means nothing is. */
  mitigation: string | null;
  /** Who is accountable for the mitigation. Free text, matching the CRM register. */
  owner: string | null;
  /** The date the mitigation is supposed to be in place by. */
  targetDate: string | null;
  status: RiskStatus;
  /**
   * Set when this risk OCCURRED and was materialised into a live issue.
   *
   * Its presence is what stops `RESOLVED` reading as good news. A risk that landed and a risk that
   * went away are both off the live register, and only this column tells them apart.
   */
  linkedIssueId: Id | null;
  createdAt: string;
  createdBy: Id | null;
  updatedAt: string;
}

export interface NewProjectRisk {
  tenantId: Id;
  projectId: Id;
  reference?: string | null;
  title: string;
  description?: string | null;
  area?: ProjectDeliveryArea;
  likelihood?: RiskLikelihood;
  impact?: RiskImpact;
  mitigation?: string | null;
  owner?: string | null;
  targetDate?: string | null;
  createdBy?: Id | null;
}

export function makeProjectRisk(input: NewProjectRisk): ProjectRisk {
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.title?.trim()) throw new Error('risk title is required');
  const now = new Date().toISOString();
  const likelihood = input.likelihood ?? 'medium';
  const impact = input.impact ?? 'medium';
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    area: input.area ?? 'OTHER',
    likelihood,
    impact,
    severity: riskSeverity(likelihood, impact),
    mitigation: input.mitigation?.trim() || null,
    owner: input.owner?.trim() || null,
    targetDate: input.targetDate ?? null,
    status: 'OPEN',
    linkedIssueId: null,
    createdAt: now,
    createdBy: input.createdBy ?? null,
    updatedAt: now,
  };
}

export type ProjectRiskPatch = Partial<Pick<ProjectRisk,
  'reference' | 'title' | 'description' | 'area' | 'likelihood' | 'impact' | 'mitigation' | 'owner' | 'targetDate'>>;

/** Patch editable fields; severity is recomputed whenever likelihood or impact moves. */
export function updateProjectRisk(risk: ProjectRisk, patch: ProjectRiskPatch): ProjectRisk {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next: ProjectRisk = { ...risk, ...defined, updatedAt: new Date().toISOString() };
  if (!next.title.trim()) throw new Error('risk title is required');
  next.title = next.title.trim();
  next.severity = riskSeverity(next.likelihood, next.impact);
  return next;
}

/**
 * Move the lifecycle.
 *
 * `ACCEPTED` is a deliberate decision to carry the exposure, so it demands a note the way
 * cancelling a project demands a reason — an acceptance nobody has to justify is indistinguishable
 * from an unattended risk, and reads as governance while providing none.
 */
export function setProjectRiskStatus(risk: ProjectRisk, status: RiskStatus, note?: string | null): ProjectRisk {
  if (risk.linkedIssueId && status !== 'RESOLVED') {
    // Phrased with "already" on purpose: the global filter classifies a state-transition guard as
    // 409 by message shape, and this is a conflict with the aggregate's state, not bad input.
    throw new Error('this risk has already materialised into an issue; it cannot return to the live register');
  }
  if (status === 'ACCEPTED' && !note?.trim()) {
    throw new Error('accepting a risk requires a reason');
  }
  return {
    ...risk,
    status,
    mitigation: status === 'ACCEPTED' ? (note?.trim() ?? risk.mitigation) : risk.mitigation,
    updatedAt: new Date().toISOString(),
  };
}

/** A risk that occurred, rather than one that went away. */
export const riskMaterialised = (risk: ProjectRisk): boolean => risk.linkedIssueId !== null;

export interface ProjectRiskSummary {
  total: number;
  /** OPEN or MITIGATING — still carried as an exposure. */
  open: number;
  mitigating: number;
  accepted: number;
  /** Closed because the exposure went away. Excludes risks that landed. */
  resolved: number;
  /**
   * Closed because the exposure LANDED. Counted apart from `resolved` so the register cannot
   * report a failed forecast as a success — the whole reason a risk register is worth keeping.
   */
  materialised: number;
  openCritical: number;
  openHigh: number;
  /** Open, with a target date already in the past. */
  overdueMitigations: number;
  needsAttention: boolean;
}

const OPEN: readonly RiskStatus[] = ['OPEN', 'MITIGATING'];
export const projectRiskIsOpen = (r: ProjectRisk): boolean => OPEN.includes(r.status);

/** `today` is passed in, never read from the clock: these rules stay pure and testable. */
export function summariseProjectRisks(risks: readonly ProjectRisk[], today: string): ProjectRiskSummary {
  let open = 0, mitigating = 0, accepted = 0, resolved = 0, materialised = 0;
  let openCritical = 0, openHigh = 0, overdueMitigations = 0;
  for (const r of risks) {
    if (riskMaterialised(r)) materialised++;
    else if (r.status === 'RESOLVED') resolved++;
    if (r.status === 'ACCEPTED') accepted++;
    if (!projectRiskIsOpen(r)) continue;
    open++;
    if (r.status === 'MITIGATING') mitigating++;
    if (r.severity === 'CRITICAL') openCritical++;
    else if (r.severity === 'HIGH') openHigh++;
    if (r.targetDate && r.targetDate < today) overdueMitigations++;
  }
  return {
    total: risks.length, open, mitigating, accepted, resolved, materialised,
    openCritical, openHigh, overdueMitigations,
    needsAttention: openCritical + openHigh > 0 || overdueMitigations > 0,
  };
}
