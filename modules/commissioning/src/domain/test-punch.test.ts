import { describe, expect, it } from 'vitest';
import { makeTestItem, applyLatestRun } from './commissioning-test-item';
import { makeTestRun, latestRun, passesOn } from './commissioning-test-run';
import { makePunchItem, closePunch } from './punch-item';

const ctx = { tenantId: 't1', commissioningId: 'c1', projectId: 'p1' };
const run = (runNo: number, result: 'pass' | 'fail', extra: { actual?: string; remarks?: string } = {}) =>
  makeTestRun({ tenantId: 't1', testItemId: 'i1', commissioningId: 'c1', projectId: 'p1', runNo, result, ...extra });

describe('commissioning test item', () => {
  it('projects the latest run onto the point', () => {
    const item = makeTestItem({ ...ctx, pointNo: '1', description: 'CCTV cam 1 live view', expected: 'Image on VMS' });
    expect(item.result).toBe('pending');
    const passed = applyLatestRun(item, run(1, 'pass', { actual: 'Image OK' }));
    expect(passed.result).toBe('pass');
    expect(passed.actual).toBe('Image OK');
    expect(passed.testedAt).not.toBeNull();
  });

  it('takes the run verbatim rather than carrying a previous measurement forward', () => {
    const item = makeTestItem({ ...ctx, pointNo: '1', description: 'Permanent link 034', expected: '≤ 90 m' });
    const measured = applyLatestRun(item, run(1, 'fail', { actual: '104.8 m', remarks: 'Over length' }));
    expect(measured.actual).toBe('104.8 m');
    // A later run that measured nothing must not appear to have measured 104.8 m.
    const unmeasured = applyLatestRun(measured, run(2, 'pass', { remarks: 'Re-pulled and re-tested' }));
    expect(unmeasured.actual).toBeNull();
    expect(unmeasured.remarks).toBe('Re-pulled and re-tested');
  });

  it('requires pointNo and description', () => {
    expect(() => makeTestItem({ ...ctx, pointNo: '', description: 'x' })).toThrow(/pointNo/i);
    expect(() => makeTestItem({ ...ctx, pointNo: '1', description: '  ' })).toThrow(/description/i);
  });
});

describe('commissioning test run (lineage)', () => {
  it('requires a real result, and a failure must explain itself', () => {
    expect(() => run(1, 'nope' as never)).toThrow(/pass or fail/i);
    expect(() => run(1, 'fail')).toThrow(/remarks/i);
    expect(() => run(1, 'fail', { remarks: '   ' })).toThrow(/remarks/i);
    expect(run(1, 'fail', { remarks: 'No image — cable fault' }).result).toBe('fail');
  });

  it('numbers runs from one', () => {
    expect(() => run(0, 'pass')).toThrow(/runNo/i);
    expect(() => run(1.5, 'pass')).toThrow(/runNo/i);
  });

  it('the latest run decides, and the failure it corrected survives', () => {
    const first = run(1, 'fail', { actual: 'No image', remarks: 'Cable fault at patch panel' });
    const second = run(2, 'pass', { actual: 'Image on VMS' });
    const lineage = [first, second];
    expect(latestRun(lineage)?.runNo).toBe(2);
    expect(passesOn(lineage)).toBe(true);
    // The point reads pass — and run #1 still says it failed, and why.
    expect(lineage[0].result).toBe('fail');
    expect(lineage[0].remarks).toMatch(/cable fault/i);
  });

  it('an unexecuted point is not a pass', () => {
    expect(passesOn([])).toBe(false);
    expect(latestRun([])).toBeNull();
  });

  it('reads the latest run by number, not by array order', () => {
    expect(latestRun([run(2, 'pass'), run(1, 'fail', { remarks: 'x' })])?.runNo).toBe(2);
  });
});

describe('punch item (defect)', () => {
  it('opens then closes with a resolution', () => {
    const p = makePunchItem({ ...ctx, description: 'Camera 3 out of focus', severity: 'major', raisedBy: 'qa1' });
    expect(p.status).toBe('open');
    expect(p.severity).toBe('major');
    const closed = closePunch(p, { resolution: 'Re-focused and re-tested', closedBy: 'tech1' });
    expect(closed.status).toBe('closed');
    expect(closed.resolution).toMatch(/re-focused/i);
    expect(closed.closedAt).not.toBeNull();
    // cannot re-close, and closing needs a resolution
    expect(() => closePunch(closed, { resolution: 'x' })).toThrow(/already closed/i);
    expect(() => closePunch(p, { resolution: '   ' })).toThrow(/resolution/i);
  });

  it('validates severity', () => {
    expect(() => makePunchItem({ ...ctx, description: 'x', severity: 'nope' as never })).toThrow(/severity/i);
  });
});
