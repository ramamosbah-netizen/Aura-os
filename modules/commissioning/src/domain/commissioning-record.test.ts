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

  it('commission is blocked until all points pass', () => {
    const partial = recordTest(make(4), { pointsPassed: 2 });
    expect(() => commission(partial, { commissionedBy: 'A', witnessedBy: 'B' })).toThrow(/only a system/i);
  });

  it('commission requires both a signer and a witness', () => {
    const tested = recordTest(make(4), { pointsPassed: 4 });
    expect(() => commission(tested, { commissionedBy: 'A', witnessedBy: '' })).toThrow(/required/i);
  });

  it('commission succeeds once tested, recording witness + timestamp', () => {
    const tested = recordTest(make(4), { pointsPassed: 4 });
    const done = commission(tested, { commissionedBy: 'J. Eng', witnessedBy: 'Consultant X' });
    expect(done.status).toBe('commissioned');
    expect(done.commissionedBy).toBe('J. Eng');
    expect(done.witnessedBy).toBe('Consultant X');
    expect(done.commissionedAt).toBeTruthy();
  });

  it('a record with no test points can be commissioned directly', () => {
    const done = commission(make(0), { commissionedBy: 'A', witnessedBy: 'B' });
    expect(done.status).toBe('commissioned');
  });

  it('cannot re-commission or mutate a commissioned record', () => {
    const done = commission(make(0), { commissionedBy: 'A', witnessedBy: 'B' });
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
