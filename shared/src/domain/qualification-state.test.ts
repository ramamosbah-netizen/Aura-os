import { describe, it, expect } from 'vitest';
import {
  qualificationFromFlags, summariseQualification, describeQualification,
  QUALIFICATION_STATUS_LABEL, QUALIFICATION_BAND_LABEL, type QualificationDimension,
} from './qualification-state';

// Phase 0 — the qualification adapter. `false` in the current boolean model means "no confirmation
// on file", NOT "the customer said no": the column is NOT NULL DEFAULT false (every row is born
// false), the only input is a checkbox, every reader treats it as a missing confirmation
// (NEED_NOT_CONFIRMED), and the live event log holds exactly one BANT write — an un-tick. So
// `false → UNKNOWN` loses nothing, while `false → "unqualified"` invents a verdict.

const none = { budgetConfirmed: false, authorityConfirmed: false, needConfirmed: false, timelineConfirmed: false };
const all = { budgetConfirmed: true, authorityConfirmed: true, needConfirmed: true, timelineConfirmed: true };

describe('qualificationFromFlags — the safe, lossless mapping', () => {
  it('true → CONFIRMED, false → UNKNOWN (never a failure)', () => {
    const v = qualificationFromFlags({ ...none, needConfirmed: true });
    expect(v.dimensions.find((d) => d.key === 'need')!.status).toBe('CONFIRMED');
    for (const k of ['budget', 'authority', 'timeline'] as const) {
      expect(v.dimensions.find((d) => d.key === k)!.status).toBe('UNKNOWN');
    }
  });

  it('a boolean can NEVER produce CONCERN or BLOCKER — those need Phase 2 storage', () => {
    for (const flags of [none, all]) {
      const v = qualificationFromFlags(flags);
      expect(v.concerns).toBe(0);
      expect(v.blockers).toBe(0);
    }
  });

  it('every CONFIRMED from a checkbox is unevidenced — a tick nobody can audit', () => {
    const v = qualificationFromFlags(all);
    expect(v.confirmed).toBe(4);
    expect(v.unevidenced).toBe(4);
    expect(v.dimensions.every((d) => d.evidence === null)).toBe(true);
  });

  it('counts add up and nothing is silently dropped', () => {
    const v = qualificationFromFlags({ ...none, budgetConfirmed: true, needConfirmed: true });
    expect(v.confirmed + v.unknown + v.concerns + v.blockers).toBe(v.total);
    expect(v.confirmed).toBe(2);
    expect(v.unknown).toBe(2);
  });
});

describe('bands describe COVERAGE, not a verdict on the deal', () => {
  it('0 and 1 confirmed are EARLY; 2-3 DEVELOPING; 4 STRONG', () => {
    expect(qualificationFromFlags(none).band).toBe('EARLY');
    expect(qualificationFromFlags({ ...none, needConfirmed: true }).band).toBe('EARLY');
    expect(qualificationFromFlags({ ...none, needConfirmed: true, budgetConfirmed: true }).band).toBe('DEVELOPING');
    expect(qualificationFromFlags({ ...all, timelineConfirmed: false }).band).toBe('DEVELOPING');
    expect(qualificationFromFlags(all).band).toBe('STRONG');
  });

  it('a single BLOCKER outranks any amount of confirmation', () => {
    const dims: QualificationDimension[] = [
      { key: 'budget', label: 'Budget', status: 'CONFIRMED', evidence: 'RFQ' },
      { key: 'authority', label: 'Authority', status: 'CONFIRMED', evidence: 'Meeting' },
      { key: 'need', label: 'Need', status: 'CONFIRMED', evidence: 'Scope' },
      { key: 'timeline', label: 'Timeline', status: 'BLOCKER', evidence: 'Project suspended' },
    ];
    expect(summariseQualification(dims).band).toBe('BLOCKED');
  });

  it('a CONCERN keeps a fully-answered deal out of STRONG', () => {
    const dims: QualificationDimension[] = [
      { key: 'budget', label: 'Budget', status: 'CONCERN', evidence: 'Budget 250k vs estimate 380k' },
      { key: 'authority', label: 'Authority', status: 'CONFIRMED', evidence: 'x' },
      { key: 'need', label: 'Need', status: 'CONFIRMED', evidence: 'x' },
      { key: 'timeline', label: 'Timeline', status: 'CONFIRMED', evidence: 'x' },
    ];
    expect(summariseQualification(dims).band).toBe('DEVELOPING');
  });
});

describe('wording — an unasked question is never a failure', () => {
  it('THE MISLABEL: 1/4 must not be called unqualified', () => {
    const s = describeQualification(qualificationFromFlags({ ...none, needConfirmed: true }));
    expect(s).toBe('Early — 1 of 4 confirmed · 3 not yet established.');
    expect(s.toLowerCase()).not.toContain('unqualified');
  });

  it('nothing confirmed reads as absence, not rejection', () => {
    const s = describeQualification(qualificationFromFlags(none));
    expect(s).toBe('Early — 0 of 4 confirmed · 4 not yet established.');
    for (const w of ['unqualified', 'failed', 'rejected', 'weak']) expect(s.toLowerCase()).not.toContain(w);
  });

  it('UNKNOWN is labelled as absence', () => {
    expect(QUALIFICATION_STATUS_LABEL.UNKNOWN).toBe('Not established');
    expect(QUALIFICATION_STATUS_LABEL.UNKNOWN.toLowerCase()).not.toContain('unqualified');
  });

  it('full coverage says so plainly', () => {
    expect(describeQualification(qualificationFromFlags(all))).toBe('Strong — 4 of 4 confirmed.');
  });

  it('every status and band label is distinct', () => {
    expect(new Set(Object.values(QUALIFICATION_STATUS_LABEL)).size).toBe(4);
    expect(new Set(Object.values(QUALIFICATION_BAND_LABEL)).size).toBe(4);
  });
});

describe('negative control', () => {
  it('the old rule called 1/4 "early / unqualified"; the new one refuses to', () => {
    const oldLabel = (score: number) => (score >= 3 ? 'well qualified' : score === 2 ? 'partially qualified' : 'early / unqualified');
    expect(oldLabel(1)).toContain('unqualified');
    expect(describeQualification(qualificationFromFlags({ ...none, needConfirmed: true }))).not.toContain('unqualified');
  });
});
