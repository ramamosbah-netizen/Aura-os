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

  it('CHARACTERIZED: an OPEN deal is unchanged — thin coverage warns, good coverage reassures', () => {
    expect(qualificationBadge({ confirmed: 1, total: 4, terminal: false, weak: true })).toEqual({ label: '1/4 BANT', tone: 'warn' });
    expect(qualificationBadge({ confirmed: 3, total: 4, terminal: false, weak: false })).toEqual({ label: '3/4 BANT', tone: 'good' });
  });

  it('an open deal is unchanged and carries no record wording', () => {
    expect(qualificationBadge({ confirmed: 2, total: 4, terminal: false, weak: false }).label).toBe('2/4 BANT');
  });
});

// ADR-0020 — the guard below was written to forbid temporal wording OUTRIGHT, because the four BANT
// booleans stayed mutable after a deal closed and AURA had no snapshot. It is NARROWED, not deleted:
// the prohibition still holds in full wherever no snapshot exists, which is every legacy Won deal.
describe('NO TEMPORAL OVERCLAIM — without a snapshot the old prohibition stands', () => {
  const noSnapshot = [undefined, null] as const;

  it('terminal presentation must never say "at award" when nothing was captured', () => {
    for (const atAward of noSnapshot) {
      for (const confirmed of [0, 1, 2, 3, 4]) {
        const label = qualificationBadge({ confirmed, total: 4, terminal: true, weak: false, atAward }).label;
        expect(label.toLowerCase()).not.toContain('at award');
        expect(label.toLowerCase()).not.toMatch(/at close|when won|snapshot/);
      }
    }
  });

  it('it reports the CURRENT record, and says so', () => {
    expect(qualificationBadge({ confirmed: 3, total: 4, terminal: true, weak: false }).label).toBe('Qualification record · 3/4 confirmed');
  });

  it('a LEGACY win — closed with no award provenance — can never be dressed as history', () => {
    // The tender-route win and the plain `PATCH stage=won` both land here: won, terminal, and no
    // snapshot, because neither stamped award provenance. See ADR-0020 "Deliberately NOT in this slice".
    const label = qualificationBadge({ confirmed: 0, total: 4, terminal: true, weak: false, atAward: null }).label;
    expect(label).toBe('Qualification record · 0/4 confirmed');
  });
});

describe('WITH a snapshot the badge speaks for the award, not for today', () => {
  it('says "at award" only once a snapshot exists', () => {
    const b = qualificationBadge({ confirmed: 3, total: 4, terminal: true, weak: false, atAward: { confirmed: 3, total: 4 } });
    expect(b.label).toBe('Qualification at award · 3/4 confirmed');
    expect(b.tone).toBe('neutral');
  });

  it('THE WHOLE POINT: the label reports the SNAPSHOT even after the record is changed underneath it', () => {
    // Exactly the observed incident: awarded at 3/4, then un-ticked to 0/4 after the close. The
    // historical figure is the one that must survive.
    const b = qualificationBadge({ confirmed: 0, total: 4, terminal: true, weak: false, atAward: { confirmed: 3, total: 4 } });
    expect(b.label).toBe('Qualification at award · 3/4 confirmed');
    expect(b.label).not.toContain('0/4');
  });

  it('an OPEN deal is never labelled from a snapshot — a live pursuit has no history to report', () => {
    // Not reachable through the domain (no snapshot without an award), asserted anyway: `terminal`
    // stays the gate, so a stray snapshot can never turn a live badge into a historical claim.
    const b = qualificationBadge({ confirmed: 1, total: 4, terminal: false, weak: true, atAward: { confirmed: 3, total: 4 } });
    expect(b).toEqual({ label: '1/4 BANT', tone: 'warn' });
  });

  it('history is still not praised — a 4/4 award record stays neutral', () => {
    expect(qualificationBadge({ confirmed: 4, total: 4, terminal: true, weak: false, atAward: { confirmed: 4, total: 4 } }).tone).toBe('neutral');
  });
});
