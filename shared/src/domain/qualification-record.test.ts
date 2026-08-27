import { describe, it, expect } from 'vitest';
import {
  mergeQualificationRecord, patchFromFlagUpdates, qualificationFlagsOf, qualificationRecordFromFlags,
  qualificationView, resolveQualificationRecord,
} from './qualification-record';

const none = { budgetConfirmed: false, authorityConfirmed: false, needConfirmed: false, timelineConfirmed: false };
const stamp = { actorId: 'u-rep', at: '2026-08-20T09:00:00.000Z' };

describe('qualificationRecordFromFlags — the legacy adapter invents nothing', () => {
  it('true → CONFIRMED, false → UNKNOWN (an absence, never a "no")', () => {
    const r = qualificationRecordFromFlags({ ...none, needConfirmed: true });
    expect(r.need.status).toBe('CONFIRMED');
    expect(r.budget.status).toBe('UNKNOWN');
  });

  it('NO FABRICATED PROVENANCE: a boolean carries no source, no author and no date', () => {
    // Backfilling `source: 'checkbox', confirmedAt: createdAt` would manufacture exactly the
    // provenance this model exists to make honest.
    const r = qualificationRecordFromFlags({ ...none, budgetConfirmed: true });
    expect(r.budget).toEqual({ status: 'CONFIRMED', evidence: null, source: null, confirmedBy: null, confirmedAt: null });
  });
});

describe('resolveQualificationRecord — one answer to "what does this deal say"', () => {
  it('the stored record wins over the shadow booleans', () => {
    const stored = mergeQualificationRecord(qualificationRecordFromFlags(none), { authority: { status: 'BLOCKER' } }, stamp);
    // Booleans deliberately disagree — the record is canonical, so BLOCKER survives.
    const resolved = resolveQualificationRecord({ ...none, authorityConfirmed: true, qualification: stored });
    expect(resolved.authority.status).toBe('BLOCKER');
  });

  it('falls back to the booleans when there is no record (a pre-Phase-2 deal)', () => {
    expect(resolveQualificationRecord({ ...none, needConfirmed: true, qualification: null }).need.status).toBe('CONFIRMED');
  });

  it('a record missing a dimension falls back per-dimension instead of reading UNKNOWN', () => {
    const partial = { ...qualificationRecordFromFlags(none) } as Record<string, unknown>;
    delete partial.timeline;
    const resolved = resolveQualificationRecord({ ...none, timelineConfirmed: true, qualification: partial as never });
    expect(resolved.timeline.status).toBe('CONFIRMED');
  });
});

describe('the booleans are a DERIVED shadow', () => {
  it('only CONFIRMED is a confirmation — CONCERN and BLOCKER are not', () => {
    const r = mergeQualificationRecord(
      qualificationRecordFromFlags(none),
      { budget: { status: 'CONFIRMED' }, authority: { status: 'CONCERN' }, need: { status: 'BLOCKER' } },
      stamp,
    );
    expect(qualificationFlagsOf(r)).toEqual({ budgetConfirmed: true, authorityConfirmed: false, needConfirmed: false, timelineConfirmed: false });
  });

  it('un-ticking a checkbox returns the dimension to UNKNOWN, and never to a "no"', () => {
    expect(patchFromFlagUpdates({ needConfirmed: false })).toEqual({ need: { status: 'UNKNOWN', source: null } });
    expect(patchFromFlagUpdates({ needConfirmed: true })).toEqual({ need: { status: 'CONFIRMED', source: 'checkbox' } });
  });

  it('a sparse flag patch touches only what it names', () => {
    expect(patchFromFlagUpdates({ budgetConfirmed: true })).toEqual({ budget: { status: 'CONFIRMED', source: 'checkbox' } });
  });
});

describe('mergeQualificationRecord — stamps only what actually moved', () => {
  it('records who and when on the changed dimension', () => {
    const r = mergeQualificationRecord(qualificationRecordFromFlags(none), { budget: { status: 'CONFIRMED', evidence: 'Budget approved in writing', source: 'document' } }, stamp);
    expect(r.budget).toEqual({ status: 'CONFIRMED', evidence: 'Budget approved in writing', source: 'document', confirmedBy: 'u-rep', confirmedAt: '2026-08-20T09:00:00.000Z' });
  });

  it('does NOT re-date the dimensions it did not touch', () => {
    const first = mergeQualificationRecord(qualificationRecordFromFlags(none), { authority: { status: 'CONFIRMED' } }, stamp);
    const second = mergeQualificationRecord(first, { budget: { status: 'CONFIRMED' } }, { actorId: 'u-two', at: '2026-08-25T10:00:00.000Z' });
    expect(second.authority.confirmedAt).toBe('2026-08-20T09:00:00.000Z');
    expect(second.authority.confirmedBy).toBe('u-rep');
  });

  it('a no-op patch changes nothing at all — not even the stamp', () => {
    const first = mergeQualificationRecord(qualificationRecordFromFlags(none), { budget: { status: 'CONFIRMED' } }, stamp);
    const again = mergeQualificationRecord(first, { budget: { status: 'CONFIRMED' } }, { actorId: 'u-two', at: '2026-08-25T10:00:00.000Z' });
    expect(again.budget).toEqual(first.budget);
  });

  it('leaving CONFIRMED drops the evidence — it evidenced a confirmation that no longer stands', () => {
    const confirmed = mergeQualificationRecord(qualificationRecordFromFlags(none), { need: { status: 'CONFIRMED', evidence: 'client email' } }, stamp);
    const retracted = mergeQualificationRecord(confirmed, { need: { status: 'UNKNOWN' } }, stamp);
    expect(retracted.need.evidence).toBeNull();
  });

  it('CONCERN and BLOCKER are reachable — the whole reason the booleans were not enough', () => {
    const r = mergeQualificationRecord(qualificationRecordFromFlags(none), { authority: { status: 'BLOCKER', evidence: 'procurement frozen' } }, stamp);
    expect(qualificationView(r).blockers).toBe(1);
    expect(qualificationView(r).band).toBe('BLOCKED');
  });
});

describe('qualificationView — the record renders through the existing view', () => {
  it('counts confirmations and surfaces unevidenced ones', () => {
    const r = mergeQualificationRecord(
      qualificationRecordFromFlags({ ...none, timelineConfirmed: true }),
      { budget: { status: 'CONFIRMED', evidence: 'signed budget' } },
      stamp,
    );
    const v = qualificationView(r);
    expect(v.confirmed).toBe(2);
    // Timeline came from a boolean: confirmed, but nothing anybody can audit.
    expect(v.unevidenced).toBe(1);
    expect(v.dimensions.find((d) => d.key === 'budget')?.source).toBe(null);
    expect(v.dimensions.find((d) => d.key === 'budget')?.confirmedBy).toBe('u-rep');
  });
});
