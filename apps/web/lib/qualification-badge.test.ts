import { describe, it, expect } from 'vitest';
import { qualificationBadge } from './qualification-badge';

// SEMANTIC CORRECTION, deliberately separate from the assessment migration.
// Old rule: tone = weak ? 'warn' : 'good'. Because `weak` is false for a closed deal, a deal WON
// with 0/4 confirmed rendered GREEN — the page praising coverage that never existed.

describe('qualificationBadge — a closed deal is stated, not judged', () => {
  it('THE BUG: won with 0/4 is no longer green', () => {
    const b = qualificationBadge({ confirmed: 0, total: 4, terminal: true, weak: false });
    expect(b.tone).not.toBe('good');
    expect(b.tone).toBe('neutral');
  });

  it('...and it is not amber either — nobody can work a closed deal', () => {
    expect(qualificationBadge({ confirmed: 0, total: 4, terminal: true, weak: true }).tone).toBe('neutral');
  });

  it('a closed deal with FULL coverage is also neutral — history, not praise', () => {
    expect(qualificationBadge({ confirmed: 4, total: 4, terminal: true, weak: false }).tone).toBe('neutral');
  });

  it('the label marks a closed deal as a record of what was known at award', () => {
    expect(qualificationBadge({ confirmed: 3, total: 4, terminal: true, weak: false }).label).toBe('3/4 BANT at award');
  });

  it('CHARACTERIZED: an OPEN deal is unchanged — thin coverage warns, good coverage reassures', () => {
    expect(qualificationBadge({ confirmed: 1, total: 4, terminal: false, weak: true })).toEqual({ label: '1/4 BANT', tone: 'warn' });
    expect(qualificationBadge({ confirmed: 3, total: 4, terminal: false, weak: false })).toEqual({ label: '3/4 BANT', tone: 'good' });
  });

  it('an open deal never carries the "at award" wording', () => {
    expect(qualificationBadge({ confirmed: 2, total: 4, terminal: false, weak: false }).label).not.toContain('at award');
  });
});
