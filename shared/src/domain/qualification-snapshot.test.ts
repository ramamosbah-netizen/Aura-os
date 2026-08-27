import { describe, it, expect } from 'vitest';
import {
  captureQualificationAtAward, readQualificationAtAward, resolveQualificationProvenance,
  qualificationAtAwardView, QUALIFICATION_SNAPSHOT_VERSION,
} from './qualification-snapshot';
import { mergeQualificationRecord, qualificationRecordFromFlags, type QualificationRecord } from './qualification-record';

const flags = (b: boolean, a: boolean, n: boolean, t: boolean) =>
  qualificationRecordFromFlags({ budgetConfirmed: b, authorityConfirmed: a, needConfirmed: n, timelineConfirmed: t });

const capture = (record: QualificationRecord) =>
  captureQualificationAtAward({ record, awardSource: 'quotation_accepted', awardedQuotationId: 'Q-002', capturedAt: '2026-08-26T17:07:00.000Z' });

describe('captureQualificationAtAward — a COPY, not a reference', () => {
  it('freezes the record as it stood', () => {
    const snap = capture(flags(true, false, true, true));
    expect(qualificationAtAwardView(snap).confirmed).toBe(3);
    expect(snap.dimensions.authority.status).toBe('UNKNOWN');
    expect(snap.capturedAt).toBe('2026-08-26T17:07:00.000Z');
    expect(snap.awardSource).toBe('quotation_accepted');
    expect(snap.awardedQuotationId).toBe('Q-002');
    expect(snap.version).toBe(QUALIFICATION_SNAPSHOT_VERSION);
  });

  it('THE INCIDENT: mutating the record afterwards does not reach the snapshot', () => {
    // 41aee1b0 — awarded at 17:07 with need confirmed, un-ticked at 18:39. A snapshot that shared
    // structure with the live record would have silently followed it down to 0/4.
    const record = flags(false, false, true, false);
    const snap = capture(record);
    const after = mergeQualificationRecord(record, { need: { status: 'UNKNOWN' } }, { actorId: 'u-admin', at: '2026-08-26T18:39:00.000Z' });

    expect(after.need.status).toBe('UNKNOWN');
    expect(snap.dimensions.need.status).toBe('CONFIRMED');
    expect(qualificationAtAwardView(snap).confirmed).toBe(1);
  });

  it('carries the full per-dimension evidence, not just a count', () => {
    const record = mergeQualificationRecord(
      flags(false, false, false, false),
      { budget: { status: 'CONFIRMED', evidence: 'PO-4471 budget line', source: 'document' }, authority: { status: 'CONCERN', evidence: 'signatory unclear' } },
      { actorId: 'u-rep', at: '2026-08-20T09:00:00.000Z' },
    );
    const snap = capture(record);
    expect(snap.dimensions.budget).toEqual({ status: 'CONFIRMED', evidence: 'PO-4471 budget line', source: 'document', confirmedBy: 'u-rep', confirmedAt: '2026-08-20T09:00:00.000Z' });
    // A CONCERN is not a confirmation, so it keeps no evidence of one.
    expect(snap.dimensions.authority.status).toBe('CONCERN');
    expect(qualificationAtAwardView(snap).confirmed).toBe(1);
  });
});

describe('readQualificationAtAward — refuses what it cannot fully understand', () => {
  it('round-trips a real snapshot through JSON (the jsonb column path)', () => {
    const snap = capture(flags(true, true, false, true));
    expect(readQualificationAtAward(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('reads NOT CAPTURED rather than half a record', () => {
    const snap = JSON.parse(JSON.stringify(capture(flags(true, true, true, true)))) as Record<string, unknown>;
    expect(readQualificationAtAward(null)).toBeNull();
    expect(readQualificationAtAward(undefined)).toBeNull();
    expect(readQualificationAtAward({})).toBeNull();
    expect(readQualificationAtAward({ ...snap, version: 2 })).toBeNull(); // a future shape is not guessed at
    expect(readQualificationAtAward({ ...snap, awardSource: null })).toBeNull(); // no provenance ⇒ not a snapshot
    expect(readQualificationAtAward({ ...snap, capturedAt: '' })).toBeNull();
    expect(readQualificationAtAward({ ...snap, dimensions: { budget: (snap.dimensions as Record<string, unknown>).budget } })).toBeNull();
    expect(readQualificationAtAward({ ...snap, dimensions: { ...(snap.dimensions as Record<string, unknown>), need: { status: 'PROBABLY' } } })).toBeNull();
  });

  it('a rejected read is INDISTINGUISHABLE from never-captured — which is the safe answer', () => {
    // The alternative (partial parse) would render a fabricated figure under the words "at award".
    expect(resolveQualificationProvenance({ terminal: true, atAward: readQualificationAtAward({ version: 99 }) }).kind).toBe('NOT_CAPTURED');
  });
});

describe('resolveQualificationProvenance — what a surface is allowed to claim', () => {
  it('open deal → CURRENT, even if something handed it a snapshot', () => {
    expect(resolveQualificationProvenance({ terminal: false, atAward: capture(flags(true, true, true, true)) }).kind).toBe('CURRENT');
  });

  it('closed WITHOUT a snapshot → NOT_CAPTURED (never the current record dressed as history)', () => {
    expect(resolveQualificationProvenance({ terminal: true, atAward: null }).kind).toBe('NOT_CAPTURED');
  });

  it('closed WITH a snapshot → AT_AWARD, carrying the historical view', () => {
    const r = resolveQualificationProvenance({ terminal: true, atAward: capture(flags(true, false, true, true)) });
    expect(r.kind).toBe('AT_AWARD');
    if (r.kind !== 'AT_AWARD') throw new Error('unreachable');
    expect(r.view.confirmed).toBe(3);
  });
});
