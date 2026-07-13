import { describe, expect, it } from 'vitest';
import {
  summarizeForecastByPeriod, captureForecast, diffForecast, UNSCHEDULED, COMMIT_THRESHOLD,
  type ForecastableOpp,
} from './forecast-snapshot';

const opp = (o: Partial<ForecastableOpp>): ForecastableOpp => ({
  stage: 'proposal', value: 100, winProbability: 50, closeDate: '2026-08-15', ...o,
});

describe('summarizeForecastByPeriod', () => {
  it('groups active deals by close-month with weighted + committed values', () => {
    const rows = summarizeForecastByPeriod([
      opp({ value: 100, winProbability: 50, closeDate: '2026-08-15' }),
      opp({ value: 200, winProbability: 80, closeDate: '2026-08-20' }), // committed (≥70)
      opp({ value: 300, winProbability: 40, closeDate: '2026-09-01' }),
    ]);
    const aug = rows.find((r) => r.period === '2026-08')!;
    expect(aug.dealCount).toBe(2);
    expect(aug.openValue).toBe(300);
    expect(aug.weightedValue).toBe(100 * 0.5 + 200 * 0.8); // 210
    expect(aug.committedValue).toBe(200); // only the 80% deal
    expect(rows.map((r) => r.period)).toEqual(['2026-08', '2026-09']);
  });

  it('excludes won/lost deals and buckets missing close dates as unscheduled', () => {
    const rows = summarizeForecastByPeriod([
      opp({ stage: 'won', value: 999 }),
      opp({ stage: 'lost', value: 999 }),
      opp({ value: 50, closeDate: null }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period: UNSCHEDULED, openValue: 50, dealCount: 1 });
  });

  it('uses COMMIT_THRESHOLD as the commit boundary', () => {
    const rows = summarizeForecastByPeriod([opp({ value: 100, winProbability: COMMIT_THRESHOLD })]);
    expect(rows[0].committedValue).toBe(100);
    const below = summarizeForecastByPeriod([opp({ value: 100, winProbability: COMMIT_THRESHOLD - 1 })]);
    expect(below[0].committedValue).toBe(0);
  });
});

describe('captureForecast', () => {
  it('stamps one shared batchId + takenAt across all period rows', () => {
    const snap = captureForecast('t1', [opp({ closeDate: '2026-08-15' }), opp({ closeDate: '2026-09-15' })], { takenAt: '2026-07-13T00:00:00.000Z' });
    expect(snap).toHaveLength(2);
    expect(new Set(snap.map((s) => s.batchId)).size).toBe(1);
    expect(snap.every((s) => s.takenAt === '2026-07-13T00:00:00.000Z')).toBe(true);
    expect(snap.every((s) => s.tenantId === 't1')).toBe(true);
  });
});

describe('diffForecast', () => {
  const prev = captureForecast('t1', [
    opp({ value: 100, winProbability: 50, closeDate: '2026-08-15' }),
    opp({ value: 200, winProbability: 50, closeDate: '2026-08-20' }),
  ], { takenAt: '2026-07-06T00:00:00.000Z' });

  it('reports no prior when prev is empty', () => {
    const d = diffForecast([], prev);
    expect(d.hasPrior).toBe(false);
    expect(d.reasons).toEqual([]);
  });

  it('detects weighted drop + deals slipping out of a period', () => {
    // A week later one of the August deals has slipped to September.
    const curr = captureForecast('t1', [
      opp({ value: 100, winProbability: 50, closeDate: '2026-08-15' }),
      opp({ value: 200, winProbability: 50, closeDate: '2026-09-20' }),
    ], { takenAt: '2026-07-13T00:00:00.000Z' });

    const d = diffForecast(prev, curr);
    expect(d.hasPrior).toBe(true);
    // Total weighted is unchanged (same deals, just moved), so slippage shows per-period, not in totals.
    expect(d.totals.weightedDelta).toBe(0);
    const aug = d.byPeriod.find((p) => p.period === '2026-08')!;
    expect(aug.dealDelta).toBe(-1);
    expect(aug.weightedDelta).toBe(-100);
    expect(d.slippedValue).toBe(100); // $100 weighted left August
    expect(d.reasons).toContain('1 deal slipped from 2026-08');
  });

  it('reports a shrinking forecast when a deal is lost', () => {
    const curr = captureForecast('t1', [
      opp({ value: 100, winProbability: 50, closeDate: '2026-08-15' }),
    ], { takenAt: '2026-07-13T00:00:00.000Z' });
    const d = diffForecast(prev, curr);
    expect(d.totals.weightedDelta).toBe(-100);
    expect(d.totals.dealDelta).toBe(-1);
    expect(d.reasons.some((r) => r.startsWith('weighted forecast down'))).toBe(true);
  });
});
