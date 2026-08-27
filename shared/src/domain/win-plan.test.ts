import { describe, expect, it } from 'vitest';
import {
  EMPTY_WIN_PLAN,
  expectedWinPlanFields,
  mergeWinPlan,
  winPlanCoverage,
  winPlanTier,
  winPlanTierSpec,
  WIN_PLAN_TIERS,
} from './win-plan';

describe('mergeWinPlan (§14)', () => {
  it('merges known keys, trims whitespace to null, and drops unknown keys', () => {
    const merged = mergeWinPlan(null, {
      customerNeed: '  CCTV coverage for Tower B  ',
      winStrategy: '   ',
      ...({ evilKey: 'nope' } as object),
    });
    expect(merged.customerNeed).toBe('CCTV coverage for Tower B');
    expect(merged.winStrategy).toBeNull();
    expect('evilKey' in merged).toBe(false);
  });

  it('is a PATCH: untouched fields survive, explicit null clears', () => {
    const first = mergeWinPlan(null, { customerNeed: 'Need', differentiation: 'Local service team' });
    const second = mergeWinPlan(first, { differentiation: null });
    expect(second.customerNeed).toBe('Need');
    expect(second.differentiation).toBeNull();
  });
});

describe('winPlanCoverage — size-aware, never a gate', () => {
  it('a small deal with the need and the play reads complete', () => {
    expect(expectedWinPlanFields(20_000)).toEqual(['customerNeed', 'winStrategy']);
    const plan = mergeWinPlan(null, { customerNeed: 'AMC renewal', winStrategy: 'Renew at same terms' });
    const cov = winPlanCoverage(plan, 20_000);
    expect(cov.coverage).toBe(100);
    expect(cov.gaps).toEqual([]);
    expect(cov.filled).toBe(2);
    expect(cov.total).toBe(10);
  });

  it('a strategic deal expects the full plan and names the gaps', () => {
    const plan = mergeWinPlan(null, { customerNeed: 'Full ELV package', winStrategy: 'Lead with integration' });
    const cov = winPlanCoverage(plan, 750_000);
    expect(expectedWinPlanFields(750_000)).toHaveLength(10);
    expect(cov.coverage).toBe(20); // 2 of 10 expected
    expect(cov.gaps.map((g) => g.key)).toContain('decisionCriteria');
    expect(cov.gaps.map((g) => g.key)).toContain('procurementPath');
  });

  it('no plan at all is 0% with every expected field a gap — honest, not punished elsewhere', () => {
    const cov = winPlanCoverage(null, 150_000);
    expect(cov.coverage).toBe(0);
    expect(cov.gaps).toHaveLength(expectedWinPlanFields(150_000).length);
    expect(winPlanCoverage(EMPTY_WIN_PLAN, 150_000).coverage).toBe(0);
  });
});

// SEMANTIC ADDITION (Phase 3) — the size band is now a NAMED tier, not three bare thresholds. These
// assert the naming; the size→fields behaviour above is unchanged and its tests still stand.
describe('winPlanTier — the named methodology depth (Phase 3)', () => {
  it('maps deal size to Light / Standard / Strategic on the same bands as the field expectations', () => {
    expect(winPlanTier(0)).toBe('light');
    expect(winPlanTier(20_000)).toBe('light');
    expect(winPlanTier(99_999)).toBe('light');
    expect(winPlanTier(100_000)).toBe('standard'); // band edge is inclusive at the lower bound
    expect(winPlanTier(499_999)).toBe('standard');
    expect(winPlanTier(500_000)).toBe('strategic');
    expect(winPlanTier(5_000_000)).toBe('strategic');
  });

  it('is the single source of the expected fields — the tier spec IS what expectedWinPlanFields returns', () => {
    for (const value of [20_000, 150_000, 750_000]) {
      expect(expectedWinPlanFields(value)).toEqual(winPlanTierSpec(value).expects);
    }
  });

  it('a negative or absent value never throws — it falls to the Light tier', () => {
    expect(winPlanTier(-1)).toBe('light');
    expect(winPlanTier(Number.NaN)).toBe('light'); // NaN >= anything is false → the 0-floor tier
  });

  it('every tier carries a human label and a rationale sentence for the UI to show', () => {
    for (const spec of WIN_PLAN_TIERS) {
      expect(spec.label).toMatch(/\w/);
      expect(spec.rationale.length).toBeGreaterThan(10);
      expect(spec.expects.length).toBeGreaterThan(0);
    }
  });
});

describe('winPlanCoverage — now names the tier it judged against', () => {
  it('carries the tier, its label and rationale alongside the numbers', () => {
    const strategic = winPlanCoverage(null, 750_000);
    expect(strategic.tier).toBe('strategic');
    expect(strategic.tierLabel).toBe('Strategic');
    expect(strategic.tierRationale).toMatch(/full plan/i);

    const light = winPlanCoverage(mergeWinPlan(null, { customerNeed: 'AMC', winStrategy: 'Renew' }), 20_000);
    expect(light.tier).toBe('light');
    expect(light.coverage).toBe(100); // and still complete for its size
  });
});
