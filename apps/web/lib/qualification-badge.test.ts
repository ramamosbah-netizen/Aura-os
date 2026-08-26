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

  it('the label reports the CURRENT record, not a moment in time', () => {
    expect(qualificationBadge({ confirmed: 3, total: 4, terminal: true, weak: false }).label).toBe('Qualification record · 3/4 confirmed');
  });

  it('NO TEMPORAL OVERCLAIM: terminal presentation must never say "at award"', () => {
    // The four booleans remain MUTABLE after a deal closes — one was observed changing on an
    // already-Won record hours after its award. AURA has no immutable qualification-at-award
    // snapshot or event, so no wording may imply the figure was captured at award time.
    // This assertion may only be relaxed once such a snapshot exists.
    for (const confirmed of [0, 1, 2, 3, 4]) {
      const label = qualificationBadge({ confirmed, total: 4, terminal: true, weak: false }).label;
      expect(label.toLowerCase()).not.toContain('at award');
      expect(label.toLowerCase()).not.toMatch(/at close|when won|snapshot/);
    }
  });

  it('CHARACTERIZED: an OPEN deal is unchanged — thin coverage warns, good coverage reassures', () => {
    expect(qualificationBadge({ confirmed: 1, total: 4, terminal: false, weak: true })).toEqual({ label: '1/4 BANT', tone: 'warn' });
    expect(qualificationBadge({ confirmed: 3, total: 4, terminal: false, weak: false })).toEqual({ label: '3/4 BANT', tone: 'good' });
  });

  it('an open deal is unchanged and carries no record wording', () => {
    expect(qualificationBadge({ confirmed: 2, total: 4, terminal: false, weak: false }).label).toBe('2/4 BANT');
  });
});
