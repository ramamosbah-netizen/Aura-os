import type { StakeholderCoverage, StakeholderCoverageGap, CommitmentSummary } from './opportunity-depth';
import type { RegisterSummary } from './deal-register';
import type { BuyingAlignment } from './buying-journey';
import type { OpportunityRisk } from './opportunity-risk';

// Opportunity Health (S7, realigned to the vision's §21) — the composition engine. The depth
// slices each gather ONE kind of evidence about a deal; this folds them into the five dimensions
// a sales manager actually manages by:
//
//   Execution    — is anyone working it? (owner, next action, activity recency, promises kept)
//   Relationship — is the buying committee mapped? (S4 stakeholder coverage)
//   Commercial   — is the deal commercially real? (value, expected close, commercial risks)
//   Competitive  — do we know who we're up against? (named competitors, competitive risks)
//   Decision     — is the buyer actually deciding? (buying-journey alignment, decisions register)
//
// The old dimensions (commitments/register/risks as their own rows) didn't disappear — they were
// EVIDENCE mislabelled as dimensions. Commitments are execution facts; the register is decision
// facts; explicit risks weigh on whichever dimension they threaten. Pure + deterministic: no new
// evidence-gathering, so API, UI and tests share this one rule set.

export type DealHealthBand = 'HEALTHY' | 'AT_RISK' | 'CRITICAL'; // 🟢 🟠 🔴 — per-dimension colour

/**
 * The overall states the vision names (§21). Band answers "how bad is the score"; state answers
 * "what KIND of trouble" — a stale deal and a blocked deal both score poorly but demand opposite
 * responses (chase vs. escalate), so collapsing them into one colour loses the instruction.
 */
export type DealHealthState = 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'BLOCKED' | 'STALE';

export type DealHealthDimensionKey = 'execution' | 'relationship' | 'commercial' | 'competitive' | 'decision';

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
  /** The vision's five-state verdict — what kind of trouble, not just how much. */
  state: DealHealthState;
  /** Why the state was chosen (only when it isn't a plain score threshold). */
  stateReason: string | null;
  dimensions: DealHealthDimension[];
  /** Flattened reasons across every dimension, most-severe dimension first — the "why". */
  reasons: string[];
  needsAttention: boolean;
}

/** Execution facts — projected from the Opportunity + its Activity stream by the caller. */
export interface ExecutionFacts {
  hasOwner: boolean;
  hasNextAction: boolean;
  nextActionDueIso: string | null;
  /** Most recent completed/created activity touching the deal; null = never touched. */
  lastActivityIso: string | null;
}

export interface CommercialFacts {
  value: number;
  closeDateIso: string | null;
}

export interface DealHealthInputs {
  /** Our sales stage — terminal deals are exempt from execution judgement (§10). */
  stage: string;
  execution: ExecutionFacts;
  coverage: StakeholderCoverage;
  commercial: CommercialFacts;
  /** Whether anyone has recorded who we're up against (Opportunity.competitors). */
  competitorsNamed: boolean;
  alignment: BuyingAlignment;
  commitments: CommitmentSummary;
  register: RegisterSummary;
  /** The explicit risk register — each open HIGH/CRITICAL risk weighs on its home dimension. */
  risks?: OpportunityRisk[];
  now?: Date;
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

const TERMINAL_STAGES = new Set(['won', 'lost']);
/** Stages where not knowing the competition is itself a finding. */
const COMPETITIVE_STAGES = new Set(['proposal', 'negotiation']);
export const STALE_AFTER_DAYS = 30;

const daysSince = (iso: string, now: Date): number => Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);

/** Which dimension each explicit risk type threatens. */
const RISK_HOME: Record<OpportunityRisk['type'], DealHealthDimensionKey> = {
  COMMERCIAL: 'commercial',
  TIMELINE: 'commercial',
  COMPETITIVE: 'competitive',
  RELATIONSHIP: 'relationship',
  CUSTOMER: 'relationship',
  TECHNICAL: 'execution',
  DELIVERY: 'execution',
  COMPLIANCE: 'execution',
  OTHER: 'execution',
};

/** Open HIGH/CRITICAL risks, folded onto the dimension they threaten. */
function riskPenalties(risks: OpportunityRisk[]): Map<DealHealthDimensionKey, { penalty: number; reasons: string[] }> {
  const out = new Map<DealHealthDimensionKey, { penalty: number; reasons: string[] }>();
  for (const r of risks) {
    if (r.status !== 'OPEN' && r.status !== 'MITIGATING') continue;
    if (r.severity !== 'CRITICAL' && r.severity !== 'HIGH') continue;
    const home = RISK_HOME[r.type];
    const entry = out.get(home) ?? { penalty: 0, reasons: [] };
    entry.penalty += r.severity === 'CRITICAL' ? 35 : 20;
    entry.reasons.push(`open ${r.severity.toLowerCase()} ${r.type.toLowerCase()} risk — ${r.title}`);
    out.set(home, entry);
  }
  return out;
}

const GAP_REASON: Record<StakeholderCoverageGap, string> = {
  NO_STAKEHOLDERS: 'no stakeholders mapped',
  NO_DECISION_MAKER: 'no decision-maker identified',
  NO_ECONOMIC_BUYER: 'no economic buyer identified',
  NO_CHAMPION: 'no champion on the deal',
  SINGLE_THREADED_RELATIONSHIP: 'single-threaded relationship',
  BLOCKER_UNMANAGED: 'an unmanaged blocker',
};

/**
 * Fold the deal evidence into the vision's five explainable dimensions + a five-state verdict.
 * Overall score is the mean of the applicable dimensions; overall band is never rosier than the
 * single worst dimension, so one critical signal can't hide behind healthy ones.
 */
export function assessOpportunityHealth(input: DealHealthInputs): OpportunityHealth {
  const now = input.now ?? new Date();
  const terminal = TERMINAL_STAGES.has(input.stage);
  const perRisk = riskPenalties(input.risks ?? []);
  const riskOn = (key: DealHealthDimensionKey): { penalty: number; reasons: string[] } =>
    perRisk.get(key) ?? { penalty: 0, reasons: [] };

  const dim = (key: DealHealthDimensionKey, label: string, base: number, reasons: string[], applicable: boolean): DealHealthDimension => {
    const r = riskOn(key);
    const score = clamp(base - r.penalty);
    return { key, label, score, band: dealHealthBand(score), reasons: [...reasons, ...r.reasons], applicable };
  };

  // ── Execution: is anyone working this deal? Terminal deals are exempt (§10). ──
  let execScore = 100;
  const execReasons: string[] = [];
  const e = input.execution;
  const staleDays = e.lastActivityIso === null ? null : daysSince(e.lastActivityIso, now);
  if (!terminal) {
    if (!e.hasOwner) { execScore -= 30; execReasons.push('no owner assigned'); }
    if (!e.hasNextAction) { execScore -= 25; execReasons.push('no next action'); }
    else if (e.nextActionDueIso && e.nextActionDueIso < now.toISOString()) { execScore -= 25; execReasons.push('next action overdue'); }
    if (e.lastActivityIso === null) { execScore -= 20; execReasons.push('no activity ever logged'); }
    else if (staleDays! > STALE_AFTER_DAYS) { execScore -= 20; execReasons.push(`no activity in ${staleDays} days`); }
    if (input.commitments.broken > 0) { execScore -= input.commitments.broken * 25; execReasons.push(plural(input.commitments.broken, 'broken promise')); }
    if (input.commitments.overdue > 0) { execScore -= input.commitments.overdue * 15; execReasons.push(plural(input.commitments.overdue, 'overdue commitment')); }
  }
  const execution = dim('execution', 'Execution', clamp(execScore), execReasons, !terminal);

  // ── Relationship: the buying committee (reuses the S4 coverage score directly). ──
  const relationship = dim('relationship', 'Relationship', clamp(input.coverage.score), input.coverage.gaps.map((g) => GAP_REASON[g]), true);

  // ── Commercial: is the deal commercially real? ──
  let comScore = 100;
  const comReasons: string[] = [];
  if (input.commercial.value <= 0) { comScore -= 40; comReasons.push('no deal value recorded'); }
  if (!input.commercial.closeDateIso) { comScore -= 25; comReasons.push('no expected close date'); }
  else if (!terminal && input.commercial.closeDateIso < now.toISOString().slice(0, 10)) { comScore -= 30; comReasons.push('expected close date has passed'); }
  const commercial = dim('commercial', 'Commercial', clamp(comScore), comReasons, true);

  // ── Competitive: not applicable until it matters — early deals with nothing recorded are
  // unjudged, but reaching proposal without knowing the field is itself a finding. ──
  const competitiveExpected = COMPETITIVE_STAGES.has(input.stage);
  const hasCompetitiveEvidence = input.competitorsNamed || riskOn('competitive').penalty > 0;
  let compScore = 100;
  const compReasons: string[] = [];
  if (!input.competitorsNamed && competitiveExpected) { compScore -= 45; compReasons.push('competitive landscape unknown at this stage'); }
  const competitive = dim('competitive', 'Competitive', clamp(compScore), compReasons, hasCompetitiveEvidence || competitiveExpected);

  // ── Decision: is the buyer actually deciding? Journey alignment + the decisions register. ──
  let decScore = 100;
  const decReasons: string[] = [];
  if (input.alignment.assessed && !input.alignment.aligned) {
    // HIGH misalignment (selling well ahead of the buyer) is CRITICAL on its own, as before S7's realignment.
    decScore -= input.alignment.severity === 'HIGH' ? 60 : 30;
    if (input.alignment.reason) decReasons.push(input.alignment.reason);
  }
  const rs = input.register;
  if (rs.invalidatedAssumptions > 0) { decScore -= rs.invalidatedAssumptions * 25; decReasons.push(plural(rs.invalidatedAssumptions, 'invalidated assumption')); }
  if (rs.overdue > 0) { decScore -= rs.overdue * 15; decReasons.push(plural(rs.overdue, 'overdue open item')); }
  if (rs.unvalidatedAssumptions > 0) { decScore -= rs.unvalidatedAssumptions * 5; decReasons.push(plural(rs.unvalidatedAssumptions, 'unvalidated assumption')); }
  const decisionApplicable = input.alignment.assessed || rs.decisions + rs.assumptions + rs.openQuestions > 0;
  const decision = dim('decision', 'Decision', clamp(decScore), decReasons, decisionApplicable);

  const dimensions = [execution, relationship, commercial, competitive, decision];
  const applicable = dimensions.filter((d) => d.applicable);
  const score = applicable.length ? clamp(applicable.reduce((s, d) => s + d.score, 0) / applicable.length) : 100;
  const worst = applicable.reduce<DealHealthBand>((b, d) => mostSevere(b, d.band), 'HEALTHY');
  const band = mostSevere(dealHealthBand(score), worst);
  const reasons = [...applicable]
    .sort((a, b) => SEVERITY[b.band] - SEVERITY[a.band])
    .flatMap((d) => d.reasons);

  // ── The five-state verdict: kind of trouble, by priority. ──
  let state: DealHealthState = 'ON_TRACK';
  let stateReason: string | null = null;
  const unmitigatedCritical = (input.risks ?? []).find((r) => r.status === 'OPEN' && r.severity === 'CRITICAL');
  const blockerUnmanaged = input.coverage.gaps.includes('BLOCKER_UNMANAGED');
  const noFutureAction = !e.nextActionDueIso || e.nextActionDueIso < now.toISOString();
  const isStale = !terminal && noFutureAction && (e.lastActivityIso === null || staleDays! > STALE_AFTER_DAYS);
  if (terminal) {
    state = 'ON_TRACK'; // closed deals are history, not work
  } else if (blockerUnmanaged || unmitigatedCritical) {
    state = 'BLOCKED';
    stateReason = blockerUnmanaged ? 'an unmanaged blocker sits in the buying committee' : `unmitigated critical risk — ${unmitigatedCritical!.title}`;
  } else if (isStale) {
    state = 'STALE';
    stateReason = e.lastActivityIso === null ? 'never worked and nothing scheduled' : `no activity in ${staleDays} days and nothing scheduled`;
  } else if (band === 'CRITICAL') {
    state = 'AT_RISK';
  } else if (band === 'AT_RISK') {
    state = 'NEEDS_ATTENTION';
  }

  return { score, band, state, stateReason, dimensions, reasons, needsAttention: !terminal && state !== 'ON_TRACK' };
}
