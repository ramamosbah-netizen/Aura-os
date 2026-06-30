import { describe, it, expect } from 'vitest';
import { makeItp, activateItp, recordPointResult, allPointsResolved, closeItp } from './itp';

const base = {
  tenantId: 't1',
  projectId: 'p1',
  reference: 'ITP-CONC-001',
  title: 'Concrete pour ITP',
  discipline: 'structural',
  points: [
    { activity: 'Rebar fixing', pointType: 'hold' as const, acceptanceCriteria: 'Per drawing' },
    { activity: 'Pour', pointType: 'witness' as const },
  ],
};

describe('makeItp', () => {
  it('creates a draft with pending points', () => {
    const itp = makeItp(base);
    expect(itp.status).toBe('draft');
    expect(itp.points).toHaveLength(2);
    expect(itp.points.every((p) => p.result === 'pending')).toBe(true);
  });

  it('requires at least one point', () => {
    expect(() => makeItp({ ...base, points: [] })).toThrow('at least one inspection point');
  });

  it('rejects an unknown point type', () => {
    expect(() => makeItp({ ...base, points: [{ activity: 'x', pointType: 'audit' as never }] })).toThrow('pointType must be one of');
  });
});

describe('lifecycle', () => {
  it('draft → active → record results → closed', () => {
    let itp = activateItp(makeItp(base));
    expect(itp.status).toBe('active');
    itp = recordPointResult(itp, 0, 'passed');
    expect(allPointsResolved(itp)).toBe(false);
    itp = recordPointResult(itp, 1, 'passed');
    expect(allPointsResolved(itp)).toBe(true);
    itp = closeItp(itp);
    expect(itp.status).toBe('closed');
  });

  it('cannot record on a draft ITP', () => {
    expect(() => recordPointResult(makeItp(base), 0, 'passed')).toThrow('only record results on an active');
  });

  it('cannot close with pending points', () => {
    const itp = recordPointResult(activateItp(makeItp(base)), 0, 'passed');
    expect(() => closeItp(itp)).toThrow('still pending');
  });

  it('rejects an out-of-range point index', () => {
    const itp = activateItp(makeItp(base));
    expect(() => recordPointResult(itp, 9, 'passed')).toThrow('out of range');
  });

  it('closes fine even with a failed point (all resolved)', () => {
    let itp = activateItp(makeItp(base));
    itp = recordPointResult(itp, 0, 'failed');
    itp = recordPointResult(itp, 1, 'passed');
    expect(closeItp(itp).status).toBe('closed');
  });
});
