import type { StakeholderCoverage, StakeholderCoverageGap, CommitmentSummary } from './opportunity-depth';
import type { RegisterSummary } from './deal-register';
import type { BuyingAlignment } from './buying-journey';
import type { RiskSummary } from './opportunity-risk';

// Opportunity Health + Risk (S7) — the composition slice. S4/S5/S6 each gather ONE kind of
// evidence about a deal (who's behind it, what was promised, what we're betting on, where the
// buyer is), but none of them judges the deal as a whole. This engine folds those four
// independent signals into an explainable per-dimension health score with reasons, so a sales
// manager sees WHY a deal is green/amber/red — not just a number. Pure + deterministic: no new
// evidence-gathering, so API, UI and tests share this one rule set.

export type DealHealthBand = 'HEALTHY' | 'AT_RISK' | 'CRITICAL'; // 🟢 🟠 🔴

export type DealHealthDimensionKey = 'relationship' | 'commitments' | 'register' | 'journey' | 'risks';

export interface DealHealthDimension {
  key: DealHealthDimensionKey;
  label: string;
  /** 0–100, higher is healthier. */
  score: number;
  band: DealHealthBand;
  /** The specific gaps that cost this dimension points — the explainability. */
  reasons: string[];
  /** False when there is no evidence to judge this dimension (excluded from the roll-up). */
  applicable: boolean;
}

export interface OpportunityHealth {
  /** 0–100 mean of the applicable dimensions. */
  score: number;
  band: DealHealthBand;
  dimensions: DealHealthDimension[];
  /** Flattened reasons across every dimension, most-severe dimension first — the "why". */
  reasons: string[];
  needsAttention: boolean;
}

/** The deal signals, each already summarised by its own engine. `risks` is optional so existing
 * callers keep working; when present it adds an explicit-risk-register dimension. */
export interface DealHealthInputs {
  coverage: StakeholderCoverage;
  commitments: CommitmentSummary;
  register: RegisterSummary;
  alignment: BuyingAlignment;
  risks?: RiskSummary;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Band thresholds — shared by the per-dimension scores and the overall roll-up. */
export function dealHealthBand(score: number): DealHealthBand {
  if (score >= 70) return 'HEALTHY';
  if (score >= 45) return 'AT_RISK';
  return 'CRITICAL';
}

const SEVERITY: Record<DealHealthBand, number> = { HEALTHY: 0, AT_RISK: 1, CRITICAL: 2 };
const mostSevere = (a: DealHealthBand, b: DealHealthBand): DealHealthBand => (SEVERITY[a] >= SEVERITY[b] ? a : b);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const GAP_REASON: Record<StakeholderCoverageGap, string> = {
  NO_STAKEHOLDERS: 'no stakeholders mapped',
  NO_DECISION_MAKER: 'no decision-maker identified',
  NO_ECONOMIC_BUYER: 'no economic buyer identified',
  NO_CHAMPION: 'no champion on the deal',
  SINGLE_THREADED_RELATIONSHIP: 'single-threaded relationship',
  BLOCKER_UNMANAGED: 'an unmanaged blocker',
};

/** Relationship = how well the buying committee is mapped (reuses the S4 coverage score directly). */
function relationshipDimension(cov: StakeholderCoverage): DealHealthDimension {
  const reasons = cov.gaps.map((g) => GAP_REASON[g]);
  return { key: 'relationship', label: 'Relationship', score: clamp(cov.score), band: dealHealthBand(cov.score), reasons, applicable: true };
}

/** Commitments = whether promises are being kept. Broken promises hurt more than overdue ones. */
function commitmentsDimension(cs: CommitmentSummary): DealHealthDimension {
  let score = 100;
  const reasons: string[] = [];
  if (cs.broken > 0) { score -= cs.broken * 25; reasons.push(plural(cs.broken, 'broken promise')); }
  if (cs.overdue > 0) { score -= cs.overdue * 20; reasons.push(plural(cs.overdue, 'overdue commitment')); }
  score = clamp(score);
  return { key: 'commitments', label: 'Commitments', score, band: dealHealthBand(score), reasons, applicable: true };
}

/** Register = the decisions/assumptions/questions log. A false assumption is the sharpest risk. */
function registerDimension(rs: RegisterSummary): DealHealthDimension {
  let score = 100;
  const reasons: string[] = [];
  if (rs.invalidatedAssumptions > 0) { score -= rs.invalidatedAssumptions * 25; reasons.push(plural(rs.invalidatedAssumptions, 'invalidated assumption')); }
  if (rs.overdue > 0) { score -= rs.overdue * 15; reasons.push(plural(rs.overdue, 'overdue open item')); }
  if (rs.unvalidatedAssumptions > 0) { score -= rs.unvalidatedAssumptions * 5; reasons.push(plural(rs.unvalidatedAssumptions, 'unvalidated assumption')); }
  score = clamp(score);
  return { key: 'register', label: 'Decisions & Assumptions', score, band: dealHealthBand(score), reasons, applicable: true };
}

/** Journey = are we running ahead of the buyer? Unassessable when the stage is terminal / unknown. */
function journeyDimension(a: BuyingAlignment): DealHealthDimension {
  if (!a.assessed) {
    return { key: 'journey', label: 'Buying Journey', score: 100, band: 'HEALTHY', reasons: [], applicable: false };
  }
  if (a.aligned) {
    return { key: 'journey', label: 'Buying Journey', score: 100, band: 'HEALTHY', reasons: [], applicable: true };
  }
  const score = a.severity === 'HIGH' ? 25 : 55;
  return { key: 'journey', label: 'Buying Journey', score, band: dealHealthBand(score), reasons: a.reason ? [a.reason] : [], applicable: true };
}

/** Risks = the explicit risk register. Open CRITICAL/HIGH risks drive attention; unassessable
 * (excluded) when no risk register exists for the deal. */
function risksDimension(rs: RiskSummary): DealHealthDimension {
  if (rs.total === 0) {
    return { key: 'risks', label: 'Risks', score: 100, band: 'HEALTHY', reasons: [], applicable: false };
  }
  let score = 100;
  const reasons: string[] = [];
  if (rs.openCritical > 0) { score -= rs.openCritical * 35; reasons.push(plural(rs.openCritical, 'critical risk') + ' open'); }
  if (rs.openHigh > 0) { score -= rs.openHigh * 20; reasons.push(plural(rs.openHigh, 'high risk') + ' open'); }
  score = clamp(score);
  // A single open CRITICAL/HIGH risk floors the band regardless of score — a critical risk should
  // never read as merely amber.
  const floor: DealHealthBand = rs.openCritical > 0 ? 'CRITICAL' : rs.openHigh > 0 ? 'AT_RISK' : 'HEALTHY';
  return { key: 'risks', label: 'Risks', score, band: mostSevere(dealHealthBand(score), floor), reasons, applicable: true };
}

/**
 * Fold the deal signals into one explainable health assessment. Overall score is the mean of the
 * applicable dimensions; overall band is never rosier than the single worst dimension, so one
 * critical signal (e.g. no buyer mapped, or an open critical risk) can't hide behind healthy ones.
 */
export function assessOpportunityHealth(input: DealHealthInputs): OpportunityHealth {
  const dimensions = [
    relationshipDimension(input.coverage),
    commitmentsDimension(input.commitments),
    registerDimension(input.register),
    journeyDimension(input.alignment),
    risksDimension(input.risks ?? { total: 0, open: 0, mitigating: 0, openCritical: 0, openHigh: 0, needsAttention: false }),
  ];
  const applicable = dimensions.filter((d) => d.applicable);
  const score = applicable.length ? clamp(applicable.reduce((s, d) => s + d.score, 0) / applicable.length) : 100;
  const worst = applicable.reduce<DealHealthBand>((b, d) => mostSevere(b, d.band), 'HEALTHY');
  const band = mostSevere(dealHealthBand(score), worst);
  // Reasons ordered by their dimension's severity (worst first), then declaration order.
  const reasons = [...applicable]
    .sort((a, b) => SEVERITY[b.band] - SEVERITY[a.band])
    .flatMap((d) => d.reasons);
  return { score, band, dimensions, reasons, needsAttention: band !== 'HEALTHY' };
}
