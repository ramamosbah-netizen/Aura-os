import { type Id, newId } from './id';

// Forecast snapshots + slippage (S8). The pipeline command center only ever shows "now": there is
// no record of what we forecast last week, so slippage — value sliding into later months, deals
// falling out of the quarter — is invisible. This captures an immutable, append-only weekly roll of
// the weighted pipeline, keyed by expected-close period, and a pure diff that turns two captures into
// an explainable slippage read. Framework-free + deterministic so API, UI and tests share one rule set.

/** Expected-close month bucket, or the catch-all for deals with no close date. */
export const UNSCHEDULED = 'unscheduled';

export interface ForecastSnapshot {
  id: Id;
  /** One capture writes one row per period, all sharing this batch id + takenAt. */
  batchId: Id;
  tenantId: Id;
  companyId: Id | null;
  takenAt: string;
  /** 'YYYY-MM' or UNSCHEDULED. */
  period: string;
  openValue: number;
  weightedValue: number;
  /** Value in high-confidence (commit) deals — winProbability ≥ COMMIT_THRESHOLD. */
  committedValue: number;
  dealCount: number;
  createdAt: string;
}

/** A minimal open-opportunity shape — the fields the forecast needs (decoupled from the full entity). */
export interface ForecastableOpp {
  stage: string;
  value: number;
  winProbability: number;
  closeDate: string | null;
}

/** Deals at/above this win probability count as "committed" (the classic commit bucket). */
export const COMMIT_THRESHOLD = 70;

const r2 = (n: number): number => Math.round(n * 100) / 100;
const isActive = (o: ForecastableOpp): boolean => o.stage !== 'won' && o.stage !== 'lost';

export interface PeriodForecast {
  period: string;
  openValue: number;
  weightedValue: number;
  committedValue: number;
  dealCount: number;
}

/** Roll the open pipeline into per-period forecast rows. Pure — the single source of the snapshot
 * numbers, so what we persist equals what the pipeline cockpit shows. */
export function summarizeForecastByPeriod(opps: ForecastableOpp[]): PeriodForecast[] {
  const byPeriod = new Map<string, PeriodForecast>();
  for (const o of opps) {
    if (!isActive(o)) continue;
    const period = o.closeDate ? o.closeDate.slice(0, 7) : UNSCHEDULED;
    const row = byPeriod.get(period) ?? { period, openValue: 0, weightedValue: 0, committedValue: 0, dealCount: 0 };
    row.openValue += o.value;
    row.weightedValue += o.value * (o.winProbability / 100);
    if (o.winProbability >= COMMIT_THRESHOLD) row.committedValue += o.value;
    row.dealCount += 1;
    byPeriod.set(period, row);
  }
  return [...byPeriod.values()]
    .map((r) => ({ ...r, openValue: r2(r.openValue), weightedValue: r2(r.weightedValue), committedValue: r2(r.committedValue) }))
    .sort((a, b) => (a.period === UNSCHEDULED ? 1 : b.period === UNSCHEDULED ? -1 : a.period < b.period ? -1 : 1));
}

export interface NewForecastSnapshot {
  tenantId: Id;
  companyId?: Id | null;
  batchId?: Id;
  takenAt?: string;
  period: string;
  openValue: number;
  weightedValue: number;
  committedValue: number;
  dealCount: number;
}

export function makeForecastSnapshot(input: NewForecastSnapshot): ForecastSnapshot {
  const now = new Date().toISOString();
  return {
    id: newId(),
    batchId: input.batchId ?? newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    takenAt: input.takenAt ?? now,
    period: input.period,
    openValue: r2(input.openValue),
    weightedValue: r2(input.weightedValue),
    committedValue: r2(input.committedValue),
    dealCount: input.dealCount,
    createdAt: now,
  };
}

/** Build one capture (a batch of period rows) from the current open pipeline. */
export function captureForecast(
  tenantId: Id,
  opps: ForecastableOpp[],
  opts: { companyId?: Id | null; takenAt?: string } = {},
): ForecastSnapshot[] {
  const batchId = newId();
  const takenAt = opts.takenAt ?? new Date().toISOString();
  return summarizeForecastByPeriod(opps).map((r) =>
    makeForecastSnapshot({ tenantId, companyId: opts.companyId ?? null, batchId, takenAt, ...r }),
  );
}

// ─────────────────────────── Slippage diff ───────────────────────────

export interface PeriodDelta {
  period: string;
  prevWeighted: number;
  currWeighted: number;
  weightedDelta: number;
  prevDeals: number;
  currDeals: number;
  dealDelta: number;
}

export interface ForecastDiff {
  hasPrior: boolean;
  takenAtPrev: string | null;
  takenAtCurr: string | null;
  totals: {
    prevWeighted: number; currWeighted: number; weightedDelta: number;
    prevOpen: number; currOpen: number; openDelta: number;
    prevDeals: number; currDeals: number; dealDelta: number;
  };
  byPeriod: PeriodDelta[];
  /** Weighted value that dropped out of the periods where it fell — the slippage magnitude. */
  slippedValue: number;
  reasons: string[];
}

const sum = (rows: ForecastSnapshot[], k: 'weightedValue' | 'openValue' | 'dealCount'): number =>
  rows.reduce((s, r) => s + r[k], 0);

/** Compare two captures (prev = older, curr = newer) into an explainable slippage read. Aligning by
 * period, a period whose weighted value or deal count falls has slipped (deals closed, lost, or moved
 * out); a rise is pull-in / new pipeline. Deterministic; empty prev → hasPrior:false. */
export function diffForecast(prev: ForecastSnapshot[], curr: ForecastSnapshot[]): ForecastDiff {
  const periods = [...new Set([...prev, ...curr].map((r) => r.period))]
    .sort((a, b) => (a === UNSCHEDULED ? 1 : b === UNSCHEDULED ? -1 : a < b ? -1 : 1));
  const wOf = (rows: ForecastSnapshot[], p: string): number => rows.find((r) => r.period === p)?.weightedValue ?? 0;
  const dOf = (rows: ForecastSnapshot[], p: string): number => rows.find((r) => r.period === p)?.dealCount ?? 0;

  const byPeriod: PeriodDelta[] = periods.map((period) => {
    const prevWeighted = r2(wOf(prev, period));
    const currWeighted = r2(wOf(curr, period));
    const prevDeals = dOf(prev, period);
    const currDeals = dOf(curr, period);
    return { period, prevWeighted, currWeighted, weightedDelta: r2(currWeighted - prevWeighted), prevDeals, currDeals, dealDelta: currDeals - prevDeals };
  });

  const totals = {
    prevWeighted: r2(sum(prev, 'weightedValue')), currWeighted: r2(sum(curr, 'weightedValue')),
    weightedDelta: r2(sum(curr, 'weightedValue') - sum(prev, 'weightedValue')),
    prevOpen: r2(sum(prev, 'openValue')), currOpen: r2(sum(curr, 'openValue')),
    openDelta: r2(sum(curr, 'openValue') - sum(prev, 'openValue')),
    prevDeals: sum(prev, 'dealCount'), currDeals: sum(curr, 'dealCount'), dealDelta: sum(curr, 'dealCount') - sum(prev, 'dealCount'),
  };
  const slippedValue = r2(byPeriod.reduce((s, p) => s + Math.max(0, p.prevWeighted - p.currWeighted), 0));

  const hasPrior = prev.length > 0;
  const reasons: string[] = [];
  if (hasPrior) {
    if (totals.weightedDelta < 0) reasons.push(`weighted forecast down ${money(-totals.weightedDelta)}`);
    else if (totals.weightedDelta > 0) reasons.push(`weighted forecast up ${money(totals.weightedDelta)}`);
    for (const p of byPeriod) {
      if (p.dealDelta < 0) reasons.push(`${-p.dealDelta} deal${p.dealDelta === -1 ? '' : 's'} slipped from ${p.period}`);
    }
    if (totals.dealDelta > 0) reasons.push(`${totals.dealDelta} new deal${totals.dealDelta === 1 ? '' : 's'} in pipeline`);
  }

  return {
    hasPrior,
    takenAtPrev: prev[0]?.takenAt ?? null,
    takenAtCurr: curr[0]?.takenAt ?? null,
    totals, byPeriod, slippedValue, reasons,
  };
}

const money = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
};

export const CRM_FORECAST_EVENT = {
  snapshotCaptured: 'crm.forecast.snapshot_captured',
} as const;
