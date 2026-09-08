// ── Risk semantics — the vocabulary itself, owned by no single register ────────────────────
//
// This file exists because two registers now speak it: CRM's `OpportunityRisk` (a risk to winning
// the deal) and Projects' `ProjectRisk` (a risk to delivering it). It holds the language and the
// arithmetic — likelihood, impact, the severity matrix, the lifecycle and the rollups — and nothing
// about what the risk is attached to.
//
// It deliberately does NOT hold a risk TYPE. `RiskType` stays in `opportunity-risk.ts` because its
// members (RELATIONSHIP, COMPETITIVE, CUSTOMER) are things that threaten a sale, not a site. The
// matrix is shared; the taxonomy is not, and pretending otherwise would give each register a list of
// categories half of which can never apply to it.
//
// Extracted rather than renamed: `opportunity-risk.ts` re-exports every name below, so no import
// anywhere in the workspace changes and no reader is left thinking risk is a CRM concept.

export type RiskLikelihood = 'low' | 'medium' | 'high';
export type RiskImpact = 'low' | 'medium' | 'high';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskStatus = 'OPEN' | 'MITIGATING' | 'RESOLVED' | 'ACCEPTED';

/** Statuses where the risk is still live and weighs on whatever it is attached to. */
export const RISK_OPEN_STATUSES: readonly RiskStatus[] = ['OPEN', 'MITIGATING'];

const RANK: Record<RiskLikelihood, number> = { low: 1, medium: 2, high: 3 };

/** likelihood × impact → severity (a 3×3 matrix). Never set severity directly. */
export function riskSeverity(likelihood: RiskLikelihood, impact: RiskImpact): RiskSeverity {
  const product = RANK[likelihood] * RANK[impact];
  if (product >= 9) return 'CRITICAL';
  if (product >= 6) return 'HIGH';
  if (product >= 3) return 'MEDIUM';
  return 'LOW';
}

export const RISK_SEVERITY_RANK: Record<RiskSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

/**
 * The shape the rollups below need — any risk record, from any register.
 *
 * Structural on purpose: `OpportunityRisk[]` and `ProjectRisk[]` both satisfy it without either
 * module importing the other, which is what lets one implementation serve both.
 */
export interface RiskLike {
  severity: RiskSeverity;
  status: RiskStatus;
}

export const riskIsOpen = (r: RiskLike): boolean => (RISK_OPEN_STATUSES as readonly string[]).includes(r.status);

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

/** Highest OPEN severity across a set — `null` when nothing is live. */
export function worstOpenSeverity(risks: readonly RiskLike[]): RiskSeverity | null {
  let worst: RiskSeverity | null = null;
  for (const r of risks) {
    if (!riskIsOpen(r)) continue;
    if (worst === null || RISK_SEVERITY_RANK[r.severity] > RISK_SEVERITY_RANK[worst]) worst = r.severity;
  }
  return worst;
}
