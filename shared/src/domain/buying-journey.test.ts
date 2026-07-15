import { describe, it, expect } from 'vitest';
import {
  buyingJourneyAlignment, scorePursuit, recommendPursuit, PURSUIT_DIMENSIONS,
} from './buying-journey';

describe('buyingJourneyAlignment', () => {
  it('unknown buying stage or terminal sales stage ⇒ not assessed (no nag)', () => {
    expect(buyingJourneyAlignment('proposal', null).assessed).toBe(false);
    expect(buyingJourneyAlignment('won', 'DECISION').assessed).toBe(false);
  });

  it('aligned when the customer is at or ahead of the expected stage', () => {
    // proposal expects OPTIONS_EVALUATING; customer at PROCUREMENT is ahead
    const a = buyingJourneyAlignment('proposal', 'PROCUREMENT');
    expect(a).toMatchObject({ assessed: true, aligned: true, gap: 0, severity: null });
  });

  it('MEDIUM when the customer is one step behind', () => {
    // proposal expects OPTIONS_EVALUATING(idx2); customer at REQUIREMENTS_DEFINING(idx1) ⇒ gap 1
    const a = buyingJourneyAlignment('proposal', 'REQUIREMENTS_DEFINING');
    expect(a).toMatchObject({ assessed: true, aligned: false, gap: 1, severity: 'MEDIUM' });
  });

  it('HIGH when we are well ahead of the buyer', () => {
    // proposal expects OPTIONS_EVALUATING(idx2); customer at PROBLEM_RECOGNIZED(idx0) ⇒ gap 2
    const a = buyingJourneyAlignment('proposal', 'PROBLEM_RECOGNIZED');
    expect(a).toMatchObject({ assessed: true, aligned: false, gap: 2, severity: 'HIGH' });
  });

  it('DEFERRED is always a HIGH misalignment', () => {
    expect(buyingJourneyAlignment('qualification', 'DEFERRED')).toMatchObject({ aligned: false, severity: 'HIGH' });
  });
});

describe('scorePursuit / recommendPursuit', () => {
  it('averages only the provided dimensions (missing ≠ zero)', () => {
    expect(scorePursuit({ strategicFit: 80, winability: 60 })).toBe(70);
    expect(scorePursuit({})).toBe(0);
  });
  it('clamps out-of-range inputs', () => {
    expect(scorePursuit({ strategicFit: 200, winability: -50 })).toBe(50); // (100 + 0) / 2
  });
  it('recommends PURSUE / REVIEW / NO_PURSUE by band', () => {
    expect(recommendPursuit(75)).toBe('PURSUE');
    expect(recommendPursuit(50)).toBe('REVIEW');
    expect(recommendPursuit(30)).toBe('NO_PURSUE');
  });
  it('exposes all nine assessment dimensions', () => {
    expect(PURSUIT_DIMENSIONS).toHaveLength(9);
    expect(PURSUIT_DIMENSIONS).toContain('expectedMargin');
  });
});
