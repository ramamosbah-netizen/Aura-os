import { describe, it, expect } from 'vitest';
import { computeBidScore, recommendationFor, DEFAULT_BID_CRITERIA } from './bid-scoring';

describe('bid scoring', () => {
  it('a 0–10 score maps onto 0–100', () => {
    expect(computeBidScore([{ name: 'a', weight: 1, score: 10 }])).toBe(100);
    expect(computeBidScore([{ name: 'a', weight: 1, score: 5 }])).toBe(50);
    expect(computeBidScore([{ name: 'a', weight: 1, score: 0 }])).toBe(0);
  });

  it('weighting blends toward the heavier criterion', () => {
    // (3×10 + 1×0) / 4 × 10 = 75
    expect(computeBidScore([{ name: 'a', weight: 3, score: 10 }, { name: 'b', weight: 1, score: 0 }])).toBe(75);
  });

  it('zero total weight is 0, never a divide-by-zero', () => {
    expect(computeBidScore([{ name: 'a', weight: 0, score: 10 }])).toBe(0);
  });

  it('thresholds: GO ≥ 70, CONDITIONAL ≥ 50, otherwise NO-GO', () => {
    expect(recommendationFor(70)).toBe('go');
    expect(recommendationFor(69.99)).toBe('conditional');
    expect(recommendationFor(50)).toBe('conditional');
    expect(recommendationFor(49.99)).toBe('no_go');
  });

  it('the default checklist at a neutral 5 reads CONDITIONAL — never a false GO', () => {
    const neutral = DEFAULT_BID_CRITERIA.map((c) => ({ ...c, score: 5 }));
    expect(computeBidScore(neutral)).toBe(50);
    expect(recommendationFor(computeBidScore(neutral))).toBe('conditional');
  });
});
