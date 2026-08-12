import { describe, expect, it } from 'vitest';
import { makeTestItem, recordResult } from './commissioning-test-item';
import { makePunchItem, closePunch } from './punch-item';

const ctx = { tenantId: 't1', commissioningId: 'c1', projectId: 'p1' };

describe('commissioning test item', () => {
  it('records a pass/fail result; a fail requires remarks', () => {
    const item = makeTestItem({ ...ctx, pointNo: '1', description: 'CCTV cam 1 live view', expected: 'Image on VMS' });
    expect(item.result).toBe('pending');
    const passed = recordResult(item, { result: 'pass', actual: 'Image OK' });
    expect(passed.result).toBe('pass');
    expect(passed.testedAt).not.toBeNull();
    expect(() => recordResult(item, { result: 'fail' })).toThrow(/remarks/i);
    const failed = recordResult(item, { result: 'fail', remarks: 'No image — cable fault' });
    expect(failed.result).toBe('fail');
  });

  it('requires pointNo and description', () => {
    expect(() => makeTestItem({ ...ctx, pointNo: '', description: 'x' })).toThrow(/pointNo/i);
    expect(() => makeTestItem({ ...ctx, pointNo: '1', description: '  ' })).toThrow(/description/i);
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
