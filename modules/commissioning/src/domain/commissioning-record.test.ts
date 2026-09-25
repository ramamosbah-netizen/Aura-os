import { describe, it, expect } from 'vitest';
import {
  makeCommissioningRecord,
  recordTest,
  commission,
  fail,
  type CommissioningRecord,
} from './commissioning-record';

function make(pointsTotal = 4): CommissioningRecord {
  return makeCommissioningRecord({
    tenantId: 't1',
    projectId: 'p1',
    code: 'TC-01',
    title: 'CCTV — Tower A',
    system: 'cctv',
    pointsTotal,
  });
}

/** Bound to an approved revision — what the checklist binding (approved-checklist.ts) produces. */
function bound(rec: CommissioningRecord): CommissioningRecord {
  return { ...rec, itpId: 'itp-cctv-r1', itpRevision: 1, itpBoundBy: 'u-tc', itpBoundAt: new Date().toISOString() };
}

describe('commissioning-record domain', () => {
  it('registers as pending with 0 points passed', () => {
    const r = make();
    expect(r.status).toBe('pending');
    expect(r.pointsPassed).toBe(0);
    expect(r.pointsTotal).toBe(4);
    expect(r.system).toBe('cctv');
  });

  it('normalises an unknown system to "other"', () => {
    const r = makeCommissioningRecord({ tenantId: 't', projectId: 'p', code: 'C', title: 'T', system: 'nope' as never });
    expect(r.system).toBe('other');
  });

  it('recordTest → in_progress when not all points pass', () => {
    const r = recordTest(make(), { pointsPassed: 2 });
    expect(r.status).toBe('in_progress');
    expect(r.pointsPassed).toBe(2);
  });

  it('recordTest → tested when every point passes', () => {
    const r = recordTest(make(), { pointsPassed: 4 });
    expect(r.status).toBe('tested');
  });

  it('recordTest clamps passed to [0, total]', () => {
    const r = recordTest(make(4), { pointsPassed: 99 });
    expect(r.pointsPassed).toBe(4);
    expect(r.status).toBe('tested');
  });

  it('commission is refused for a record not bound to an approved checklist, whatever its tally says', () => {
    const tested = recordTest(make(4), { pointsPassed: 4 });
    expect(() => commission(tested, { commissionedBy: 'A', witnessedBy: 'B' })).toThrow(/only a system bound to an approved ITP revision/i);
    expect(() => commission(make(0), { commissionedBy: 'A', witnessedBy: 'B' })).toThrow(/only a system bound to an approved ITP revision/i);
  });

  it('commission requires both a signer and a witness', () => {
    const tested = bound(recordTest(make(4), { pointsPassed: 4 }));
    expect(() => commission(tested, { commissionedBy: 'A', witnessedBy: '' })).toThrow(/required/i);
  });

  it('commission succeeds once bound, recording witness + timestamp', () => {
    // What the points say is the service's question (checklistPassGaps) and PostgreSQL's — not the tally's.
    const tested = bound(recordTest(make(4), { pointsPassed: 4 }));
    const done = commission(tested, { commissionedBy: 'J. Eng', witnessedBy: 'Consultant X' });
    expect(done.status).toBe('commissioned');
    expect(done.commissionedBy).toBe('J. Eng');
    expect(done.witnessedBy).toBe('Consultant X');
    expect(done.commissionedAt).toBeTruthy();
  });

  it('cannot re-commission or mutate a commissioned record', () => {
    const done = commission(bound(make(0)), { commissionedBy: 'A', witnessedBy: 'B' });
    expect(() => commission(done, { commissionedBy: 'A', witnessedBy: 'B' })).toThrow(/already/i);
    expect(() => recordTest(done, { pointsPassed: 1 })).toThrow(/already/i);
    expect(() => fail(done, 'x')).toThrow(/already/i);
  });

  it('fail records the reason and moves to failed', () => {
    const r = fail(recordTest(make(), { pointsPassed: 1 }), 'camera 3 offline');
    expect(r.status).toBe('failed');
    expect(r.remarks).toBe('camera 3 offline');
  });
});
