import { type Id, newId, type RiskImpact, type RiskLikelihood, type RiskSeverity, riskSeverity } from '@aura/shared';

/**
 * §21 — the PROJECT risk register: an uncertain FUTURE event or condition that would threaten
 * delivery if it occurred.
 *
 * WHAT IS SHARED WITH CRM, AND WHAT IS NOT.
 *
 * The severity ARITHMETIC is shared (`@aura/shared` → `domain/risk`): likelihood × impact →
 * LOW/MEDIUM/HIGH/CRITICAL. That is a matrix, it means the same thing regardless of subject, and
 * both registers compute it identically.
 *
 * The LIFECYCLE is not, and that is the point of `ProjectRiskStatus` below. CRM's `RiskStatus` has
 * no state for a risk that OCCURRED, because a deal risk that lands ends the deal conversation. A
 * delivery risk that lands becomes a live issue, and this register must record that outcome apart
 * from "the exposure went away" — otherwise a failed forecast and a correct one are the same row.
 *
 * The TAXONOMY is not shared either. CRM's `RiskType` names threats to a sale (RELATIONSHIP,
 * COMPETITIVE, CUSTOMER); none of those can threaten a site.
 *
 * Storage is separate too: widening the CRM table would put Projects' data inside a CRM-owned
 * table and make one module's migration another module's outage.
 */

/**
 * Where a threat to delivery comes from — named after the domain that would have to answer it.
 *
 * Shared with `ProjectIssue`, deliberately: a procurement risk that occurs is a procurement issue,
 * and forcing a re-categorisation at materialisation would break the link between the forecast and
 * what it became.
 */
export type ProjectDeliveryArea =
  | 'DESIGN' | 'PROCUREMENT' | 'SCHEDULE' | 'COST' | 'QUALITY' | 'SAFETY'
  | 'RESOURCE' | 'CLIENT' | 'AUTHORITY' | 'SUBCONTRACTOR' | 'INTERFACE' | 'OTHER';

export const PROJECT_DELIVERY_AREAS: readonly ProjectDeliveryArea[] = [
  'DESIGN', 'PROCUREMENT', 'SCHEDULE', 'COST', 'QUALITY', 'SAFETY',
  'RESOURCE', 'CLIENT', 'AUTHORITY', 'SUBCONTRACTOR', 'INTERFACE', 'OTHER',
];

/**
 * The delivery-risk lifecycle. Projects' own, not CRM's.
 *
 *   OPEN          identified, nothing being done about it yet
 *   MITIGATING    a mitigation is in flight
 *   ACCEPTED      a deliberate decision to carry the exposure — demands a reason
 *   RESOLVED      TERMINAL — the exposure went away
 *   MATERIALISED  TERMINAL — the exposure LANDED; the live problem is now an issue
 *
 * `RESOLVED` and `MATERIALISED` are both off the live register and are opposite outcomes. Keeping
 * them apart is the whole reason a risk register is worth maintaining: it is the only way to ask
 * afterwards whether the risk process actually worked.
 */
export type ProjectRiskStatus = 'OPEN' | 'MITIGATING' | 'ACCEPTED' | 'RESOLVED' | 'MATERIALISED';

export const PROJECT_RISK_STATUSES: readonly ProjectRiskStatus[] =
  ['OPEN', 'MITIGATING', 'ACCEPTED', 'RESOLVED', 'MATERIALISED'];

const NEXT: Record<ProjectRiskStatus, readonly ProjectRiskStatus[]> = {
  OPEN: ['MITIGATING', 'ACCEPTED', 'RESOLVED', 'MATERIALISED'],
  MITIGATING: ['ACCEPTED', 'RESOLVED', 'MATERIALISED', 'OPEN'],
  // An accepted exposure can still land, and can be taken back onto the active register if the
  // decision to carry it is revisited.
  ACCEPTED: ['OPEN', 'MITIGATING', 'RESOLVED', 'MATERIALISED'],
  RESOLVED: [],
  MATERIALISED: [],
};

export const riskTransitionsFor = (from: ProjectRiskStatus): readonly ProjectRiskStatus[] => NEXT[from];

/** Statuses where the risk is still carried as a live exposure. */
export const PROJECT_RISK_OPEN_STATUSES: readonly ProjectRiskStatus[] = ['OPEN', 'MITIGATING', 'ACCEPTED'];

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
  /** Why the exposure is being carried. Required to reach `ACCEPTED`. */
  acceptanceReason: string | null;
  /**
   * Who is accountable for the mitigation, as a free-text NAME (AURA-PM-002/AURA-PM-001).
   *
   * Kept deliberately: the accountable person is often not a user of the system — a subcontractor's
   * engineer, a client rep — and a name is all that exists for them. It is a label, not the
   * identity: it cannot answer "is this mine?" and must never be matched against an actor id.
   */
  owner: string | null;
  /**
   * The accountable user, when they ARE one (AURA-PM-001). This is the stable id My Work matches on
   * to answer "risks assigned to me" — the half a project manager opens My Work for. Null when the
   * owner is only a name, or nobody is assigned. `owner` (the name) and `ownerId` are independent:
   * a record may carry a name with no user, an assigned user, both, or neither.
   */
  ownerId: Id | null;
  /** The date the mitigation is supposed to be in place by. */
  targetDate: string | null;
  status: ProjectRiskStatus;
  createdAt: string;
  createdBy: Id | null;
  updatedAt: string;
  /**
   * NOTE: there is deliberately no `linkedIssueId`.
   *
   * Provenance is stored exactly once, on the issue, as `originRiskId` — with a UNIQUE constraint,
   * so a risk materialises at most once. A pointer stored on both rows is two rows asserting one
   * fact, and two rows that can disagree. What this row says is `status = 'MATERIALISED'`, which is
   * a different fact: what happened to this risk, not where the issue came from.
   */
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
  ownerId?: Id | null;
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
    acceptanceReason: null,
    owner: input.owner?.trim() || null,
    ownerId: input.ownerId ?? null,
    targetDate: input.targetDate ?? null,
    status: 'OPEN',
    createdAt: now,
    createdBy: input.createdBy ?? null,
    updatedAt: now,
  };
}

export type ProjectRiskPatch = Partial<Pick<ProjectRisk,
  'reference' | 'title' | 'description' | 'area' | 'likelihood' | 'impact' | 'mitigation' | 'owner' | 'ownerId' | 'targetDate'>>;

/** Patch editable fields; severity is recomputed whenever likelihood or impact moves. */
export function updateProjectRisk(risk: ProjectRisk, patch: ProjectRiskPatch): ProjectRisk {
  if (isTerminalRisk(risk)) {
    throw new Error(`a ${risk.status.toLowerCase()} risk can only be read; it is closed to further edits`);
  }
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next: ProjectRisk = { ...risk, ...defined, updatedAt: new Date().toISOString() };
  if (!next.title.trim()) throw new Error('risk title is required');
  next.title = next.title.trim();
  next.severity = riskSeverity(next.likelihood, next.impact);
  return next;
}

export const isTerminalRisk = (risk: ProjectRisk): boolean => NEXT[risk.status].length === 0;

/** A risk that occurred, rather than one that went away. */
export const riskMaterialised = (risk: ProjectRisk): boolean => risk.status === 'MATERIALISED';

/**
 * Move the lifecycle by hand.
 *
 * `MATERIALISED` is NOT reachable here. It is produced only by the materialisation command, which
 * writes the risk and the new issue in one transaction — so a risk can never be marked as having
 * landed without the live problem it landed into existing. Allowing this function to set it would
 * be a second writer for the one operation that must have exactly one.
 *
 * `ACCEPTED` demands a reason for the same purpose cancelling a project does: an acceptance nobody
 * had to justify is indistinguishable from an unattended risk and reads as governance while
 * providing none.
 */
export function setProjectRiskStatus(
  risk: ProjectRisk,
  status: ProjectRiskStatus,
  note?: string | null,
): ProjectRisk {
  if (status === 'MATERIALISED') {
    throw new Error('a risk can only be marked materialised by materialising it into an issue');
  }
  if (status === risk.status) return risk;
  if (!NEXT[risk.status].includes(status)) {
    throw new Error(
      NEXT[risk.status].length === 0
        ? `a ${risk.status.toLowerCase()} risk is closed; it cannot move to ${status}`
        : `a ${risk.status.toLowerCase()} risk can only move to: ${NEXT[risk.status].join(', ')}`,
    );
  }
  if (status === 'ACCEPTED' && !note?.trim()) {
    throw new Error('accepting a risk requires a reason');
  }
  return {
    ...risk,
    status,
    // Kept in its own column rather than overwriting the mitigation: what was being done about a
    // risk and why it was accepted instead are different statements, and one must not erase the
    // other when acceptance is later revisited.
    acceptanceReason: status === 'ACCEPTED' ? (note?.trim() ?? null) : risk.acceptanceReason,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Retire a risk because it OCCURRED. Called only by the materialisation command.
 *
 * Separated from `setProjectRiskStatus` so the one path to `MATERIALISED` is named, and so a
 * future caller cannot reach it by passing a status string.
 */
export function markRiskMaterialised(risk: ProjectRisk): ProjectRisk {
  if (risk.status === 'MATERIALISED') throw new Error('this risk has already materialised into an issue');
  if (!NEXT[risk.status].includes('MATERIALISED')) {
    throw new Error(`a ${risk.status.toLowerCase()} risk did not occur; only a live exposure can materialise`);
  }
  return { ...risk, status: 'MATERIALISED', updatedAt: new Date().toISOString() };
}

export interface ProjectRiskSummary {
  total: number;
  /** OPEN, MITIGATING or ACCEPTED — still carried as an exposure. */
  open: number;
  mitigating: number;
  accepted: number;
  /** Closed because the exposure went away. */
  resolved: number;
  /**
   * Closed because the exposure LANDED. Counted apart from `resolved` so the register cannot
   * report a failed forecast as a success.
   */
  materialised: number;
  openCritical: number;
  openHigh: number;
  /** Open, with a target date already in the past. */
  overdueMitigations: number;
  needsAttention: boolean;
}

export const projectRiskIsOpen = (r: ProjectRisk): boolean => PROJECT_RISK_OPEN_STATUSES.includes(r.status);

/** `today` is passed in, never read from the clock: these rules stay pure and testable. */
export function summariseProjectRisks(risks: readonly ProjectRisk[], today: string): ProjectRiskSummary {
  let open = 0, mitigating = 0, accepted = 0, resolved = 0, materialised = 0;
  let openCritical = 0, openHigh = 0, overdueMitigations = 0;
  for (const r of risks) {
    if (r.status === 'RESOLVED') resolved++;
    if (r.status === 'MATERIALISED') materialised++;
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
