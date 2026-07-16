import type { OpportunityStage } from './crm';

// Forecast categories (vision §23 / audit G13). The forecast previously had ONE number per deal —
// `winProbability` — doing three different jobs. §23 demands they stay separate, because they
// disagree in exactly the deals that matter:
//
//   STAGE probability   — what deals at this stage historically do. Derived from the stage,
//                         never stored, never editable: it is a property of the process.
//   SALES confidence    — the salesperson's own read (the existing `winProbability` column —
//                         it was always a hand-set number, now honestly named).
//   MODEL probability   — the AI read (POST /:id/forecast). Advisory, never authoritative.
//
// The forecast CATEGORY is the management commitment language over the top:
//   PIPELINE → BEST_CASE → COMMIT → CLOSED.
// It is derived from confidence unless a human explicitly sets it — a salesperson saying
// "commit" is a statement to management, so an explicit call always beats the derivation
// (except on terminal deals, which are CLOSED no matter what anyone typed).

export type ForecastCategory = 'PIPELINE' | 'BEST_CASE' | 'COMMIT' | 'CLOSED';

export const FORECAST_CATEGORIES: readonly ForecastCategory[] = ['PIPELINE', 'BEST_CASE', 'COMMIT', 'CLOSED'];

/** What deals at each stage do — the process prior, deliberately coarse and stable. */
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  qualification: 10,
  proposal: 35,
  negotiation: 60,
  won: 100,
  lost: 0,
};

/** Confidence thresholds for the derived category (only used when no explicit call exists). */
export const COMMIT_CONFIDENCE = 70;
export const BEST_CASE_CONFIDENCE = 40;

const TERMINAL: readonly OpportunityStage[] = ['won', 'lost'];

/**
 * Resolve a deal's forecast category. Terminal stages are CLOSED regardless of any explicit
 * value; an explicit human call beats the derivation; otherwise sales confidence maps to
 * COMMIT (≥70) / BEST_CASE (≥40) / PIPELINE. An unrated deal is PIPELINE — the honest floor,
 * never an invented commit.
 */
export function resolveForecastCategory(
  stage: OpportunityStage | string,
  salesConfidence: number,
  explicit: ForecastCategory | null | undefined,
): ForecastCategory {
  if (TERMINAL.includes(stage as OpportunityStage)) return 'CLOSED';
  if (explicit && explicit !== 'CLOSED') return explicit; // CLOSED is earned by the stage, not typed
  if (salesConfidence >= COMMIT_CONFIDENCE) return 'COMMIT';
  if (salesConfidence >= BEST_CASE_CONFIDENCE) return 'BEST_CASE';
  return 'PIPELINE';
}

/** The three §23 numbers for one deal, side by side — disagreement is the signal, not an error. */
export interface ProbabilityTriangle {
  stageProbability: number;
  salesConfidence: number;
  /** Advisory model read; null until one has been requested. */
  modelProbability: number | null;
  /** |stage prior − sales confidence| ≥ 30 → someone is wrong; worth a conversation. */
  divergent: boolean;
}

export function probabilityTriangle(
  stage: OpportunityStage | string,
  salesConfidence: number,
  modelProbability: number | null = null,
): ProbabilityTriangle {
  const stageProbability = STAGE_PROBABILITY[stage as OpportunityStage] ?? 0;
  return {
    stageProbability,
    salesConfidence,
    modelProbability,
    divergent: Math.abs(stageProbability - salesConfidence) >= 30,
  };
}

/** The minimal deal shape the rollup needs. */
export interface CategorizableOpp {
  stage: OpportunityStage | string;
  value: number;
  winProbability: number;
  forecastCategory?: ForecastCategory | null;
}

export interface CategoryRollup {
  category: ForecastCategory;
  deals: number;
  value: number;
  weighted: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Roll every deal into its category, all four always present (a zero COMMIT row is a
 * statement, not an omission). CLOSED counts WON value only — lost deals close at zero.
 */
export function rollupByCategory(opps: CategorizableOpp[]): CategoryRollup[] {
  const rows = new Map<ForecastCategory, CategoryRollup>(
    FORECAST_CATEGORIES.map((c) => [c, { category: c, deals: 0, value: 0, weighted: 0 }]),
  );
  for (const o of opps) {
    if (o.stage === 'lost') continue;
    const cat = resolveForecastCategory(o.stage, o.winProbability, o.forecastCategory);
    const row = rows.get(cat)!;
    row.deals += 1;
    row.value += o.value;
    row.weighted += cat === 'CLOSED' ? o.value : o.value * (o.winProbability / 100);
  }
  return FORECAST_CATEGORIES.map((c) => {
    const r = rows.get(c)!;
    return { ...r, value: r2(r.value), weighted: r2(r.weighted) };
  });
}
