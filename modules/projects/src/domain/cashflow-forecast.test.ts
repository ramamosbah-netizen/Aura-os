import { describe, it, expect } from 'vitest';
import { makeCashflowForecast, setForecastPeriods, summariseCashflow } from './cashflow-forecast';

const base = { tenantId: 't1', projectId: 'p1', projectName: 'Marina Tower' };

describe('project cash-flow forecast domain', () => {
  it('sorts periods, validates period format + non-negative amounts', () => {
    const f = makeCashflowForecast({ ...base, periods: [{ period: '2026-03', inflow: 100 }, { period: '2026-01', outflow: 50 }] });
    expect(f.periods.map((p) => p.period)).toEqual(['2026-01', '2026-03']);
    expect(() => makeCashflowForecast({ ...base, periods: [{ period: '2026/01' }] })).toThrow('YYYY-MM');
    expect(() => makeCashflowForecast({ ...base, periods: [{ period: '2026-01', inflow: -1 }] })).toThrow('inflow cannot be negative');
    expect(() => makeCashflowForecast({ ...base, projectId: '' })).toThrow('projectId is required');
  });

  it('summarise computes net, running cumulative, totals + peak funding', () => {
    const f = makeCashflowForecast({
      ...base,
      periods: [
        { period: '2026-01', inflow: 0, outflow: 300 },   // net -300, cum -300
        { period: '2026-02', inflow: 100, outflow: 250 }, // net -150, cum -450 (peak)
        { period: '2026-03', inflow: 800, outflow: 100 }, // net +700, cum +250
      ],
    });
    const s = summariseCashflow(f);
    expect(s.rows.map((r) => r.cumulative)).toEqual([-300, -450, 250]);
    expect(s.totalInflow).toBe(900);
    expect(s.totalOutflow).toBe(650);
    expect(s.netTotal).toBe(250);
    expect(s.peakFunding).toBe(-450); // most-negative cumulative
  });

  it('setForecastPeriods replaces + re-sorts; empty forecast nets zero', () => {
    let f = makeCashflowForecast(base);
    expect(summariseCashflow(f).netTotal).toBe(0);
    f = setForecastPeriods(f, [{ period: '2026-05', inflow: 500, outflow: 200 }]);
    expect(summariseCashflow(f).peakFunding).toBe(0); // never goes negative
    expect(summariseCashflow(f).netTotal).toBe(300);
  });
});
