import { describe, expect, it } from 'vitest';
import {
  resolveForecastCategory, probabilityTriangle, rollupByCategory, STAGE_PROBABILITY,
} from './forecast-category';
import { summarizeForecastByPeriod } from './forecast-snapshot';

describe('resolveForecastCategory (§23)', () => {
  it('derives from sales confidence when no explicit call exists', () => {
    expect(resolveForecastCategory('proposal', 20, null)).toBe('PIPELINE');
    expect(resolveForecastCategory('proposal', 40, null)).toBe('BEST_CASE');
    expect(resolveForecastCategory('proposal', 70, null)).toBe('COMMIT');
  });

  it('an explicit human call beats the derivation — both directions', () => {
    expect(resolveForecastCategory('proposal', 90, 'PIPELINE')).toBe('PIPELINE'); // sandbagging is a statement too
    expect(resolveForecastCategory('proposal', 10, 'COMMIT')).toBe('COMMIT');
  });

  it('terminal stages are CLOSED no matter what was typed', () => {
    expect(resolveForecastCategory('won', 10, 'PIPELINE')).toBe('CLOSED');
    expect(resolveForecastCategory('lost', 90, 'COMMIT')).toBe('CLOSED');
  });

  it('CLOSED cannot be claimed by an explicit call on an open deal', () => {
    expect(resolveForecastCategory('negotiation', 50, 'CLOSED')).toBe('BEST_CASE');
  });
});

describe('probabilityTriangle (§23 — three numbers, never one)', () => {
  it('derives the stage prior and flags divergence from sales confidence', () => {
    const t = probabilityTriangle('qualification', 85);
    expect(t.stageProbability).toBe(STAGE_PROBABILITY.qualification); // 10
    expect(t.salesConfidence).toBe(85);
    expect(t.modelProbability).toBeNull();
    expect(t.divergent).toBe(true); // |10 − 85| ≥ 30 — someone is wrong
    expect(probabilityTriangle('negotiation', 60).divergent).toBe(false);
  });
});

describe('rollupByCategory', () => {
  it('all four rows always present; CLOSED counts won value; lost closes at zero', () => {
    const rows = rollupByCategory([
      { stage: 'qualification', value: 100, winProbability: 10 },           // PIPELINE
      { stage: 'proposal', value: 200, winProbability: 50 },                // BEST_CASE
      { stage: 'negotiation', value: 300, winProbability: 20, forecastCategory: 'COMMIT' }, // explicit call
      { stage: 'won', value: 400, winProbability: 90 },                     // CLOSED, full value
      { stage: 'lost', value: 999, winProbability: 90 },                    // excluded entirely
    ]);
    expect(rows.map((r) => r.category)).toEqual(['PIPELINE', 'BEST_CASE', 'COMMIT', 'CLOSED']);
    expect(rows[0]).toMatchObject({ deals: 1, value: 100, weighted: 10 });
    expect(rows[1]).toMatchObject({ deals: 1, value: 200, weighted: 100 });
    expect(rows[2]).toMatchObject({ deals: 1, value: 300, weighted: 60 }); // weighted stays confidence-based
    expect(rows[3]).toMatchObject({ deals: 1, value: 400, weighted: 400 });
  });
});

describe('snapshot committedValue honours the explicit call', () => {
  it('an explicit COMMIT at low confidence commits; an explicit PIPELINE at high confidence does not', () => {
    const rows = summarizeForecastByPeriod([
      { stage: 'proposal', value: 100, winProbability: 10, closeDate: '2026-09-15', forecastCategory: 'COMMIT' },
      { stage: 'proposal', value: 200, winProbability: 95, closeDate: '2026-09-20', forecastCategory: 'PIPELINE' },
      { stage: 'proposal', value: 400, winProbability: 80, closeDate: '2026-09-25' }, // uncalled → threshold
    ]);
    expect(rows[0].committedValue).toBe(500); // 100 (explicit) + 400 (threshold), NOT the sandbagged 200
  });
});
