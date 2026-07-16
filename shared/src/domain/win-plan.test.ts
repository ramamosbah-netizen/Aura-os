import { describe, expect, it } from 'vitest';
import { EMPTY_WIN_PLAN, expectedWinPlanFields, mergeWinPlan, winPlanCoverage } from './win-plan';

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
