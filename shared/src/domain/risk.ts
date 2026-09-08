// ── Risk arithmetic — the severity matrix, and nothing else ───────────────────────────────
//
// This file exists because two registers compute severity the same way: CRM's `OpportunityRisk`
// (a risk to winning the deal) and Projects' `ProjectRisk` (a risk to delivering it). Likelihood ×
// impact → severity is arithmetic. It means the same thing regardless of what the risk is attached
// to, and sharing it costs nothing.
//
// WHAT IS DELIBERATELY NOT HERE.
//
// A LIFECYCLE is not arithmetic — it is a business process, and the two registers do not run the
// same one. CRM's `RiskStatus` (OPEN → MITIGATING → RESOLVED | ACCEPTED) has no word for a risk
// that OCCURRED, because a deal risk that lands ends the deal conversation. A delivery risk that
// lands becomes a live issue and the register must record that outcome apart from "it went away".
// So `RiskStatus`, `RISK_OPEN_STATUSES` and every rollup that depends on them stay in
// `opportunity-risk.ts`, where they belong to one register; Projects declares `ProjectRiskStatus`
// for itself.
//
// The distinction matters because a lifecycle placed here would be *called* generic and would then
// pull whichever register adopted it toward the other's process, one helper at a time.
//
// A TAXONOMY is not arithmetic either. `RiskType` in CRM names threats to a sale (RELATIONSHIP,
// COMPETITIVE, CUSTOMER); none of those can threaten a site. Projects has `ProjectDeliveryArea`.
//
// Extracted rather than renamed: `opportunity-risk.ts` re-exports every name below, so no import
// anywhere in the workspace changed.

export type RiskLikelihood = 'low' | 'medium' | 'high';
export type RiskImpact = 'low' | 'medium' | 'high';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const RANK: Record<RiskLikelihood, number> = { low: 1, medium: 2, high: 3 };

/** likelihood × impact → severity (a 3×3 matrix). Never set severity directly. */
export function riskSeverity(likelihood: RiskLikelihood, impact: RiskImpact): RiskSeverity {
  const product = RANK[likelihood] * RANK[impact];
  if (product >= 9) return 'CRITICAL';
  if (product >= 6) return 'HIGH';
  if (product >= 3) return 'MEDIUM';
  return 'LOW';
}

/** Ordering over severities, for "which of these is worst" — still arithmetic, not lifecycle. */
export const RISK_SEVERITY_RANK: Record<RiskSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

/** The worst of a set of severities, ignoring which register they came from. `null` when empty. */
export function worstSeverity(severities: readonly RiskSeverity[]): RiskSeverity | null {
  let worst: RiskSeverity | null = null;
  for (const s of severities) {
    if (worst === null || RISK_SEVERITY_RANK[s] > RISK_SEVERITY_RANK[worst]) worst = s;
  }
  return worst;
}
