import { describe, it, expect } from 'vitest';
import { makeItp, activateItp, recordPointResult, allPointsResolved, closeItp, type CitedInspection } from './itp';

/** The approved inspection that releases a hold point on project p1. */
const released: CitedInspection = { id: 'ir-1', irNumber: 'IR-001', projectId: 'p1', status: 'approved' };

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
    itp = recordPointResult(itp, 0, 'passed', { inspection: released });
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
    const itp = recordPointResult(activateItp(makeItp(base)), 0, 'passed', { inspection: released });
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

/**
 * QHS-02 — a hold point is released by its inspection, and every result says who recorded it.
 * Recording a result used to store a bare status: no actor, no time, no inspection, and a later write
 * replaced it without trace.
 */
describe('hold and witness points', () => {
  const active = () => activateItp(makeItp(base), 'u-qaqc');

  it('will not pass a hold point without the approved inspection that released it', () => {
    expect(() => recordPointResult(active(), 0, 'passed', { recordedBy: 'u-qaqc' })).toThrow(/approved inspection request is required to pass hold point 1/);
    expect(() => recordPointResult(active(), 0, 'passed', { inspection: { ...released, status: 'requested' } })).toThrow(/is not approved \(status requested\)/);
    expect(() => recordPointResult(active(), 0, 'passed', { inspection: { ...released, projectId: 'p2' } })).toThrow(/does not belong to this ITP's project/);
    // A failed hold point needs no release — the inspection did not release it.
    expect(recordPointResult(active(), 0, 'failed', { recordedBy: 'u-qaqc' }).points[0].result).toBe('failed');
  });

  it('records who recorded each result, when, and on which inspection', () => {
    const itp = recordPointResult(active(), 0, 'passed', { recordedBy: 'u-qaqc', inspection: released, note: ' consultant attended ' });
    expect(itp.points[0].history).toEqual([
      expect.objectContaining({ result: 'passed', recordedBy: 'u-qaqc', inspectionRequestId: 'ir-1', inspectionRequestNumber: 'IR-001', note: 'consultant attended' }),
    ]);
    expect(itp.points[0].history?.[0].recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // A witness point may be passed with no inspection cited, and says so.
    const witnessed = recordPointResult(itp, 1, 'passed', { recordedBy: 'u-qaqc' });
    expect(witnessed.points[1].history?.[0]).toMatchObject({ recordedBy: 'u-qaqc', inspectionRequestId: null });
  });

  it('keeps a passed point final, and lets a failed one be re-inspected', () => {
    let itp = recordPointResult(active(), 0, 'failed', { recordedBy: 'u-qaqc' });
    itp = recordPointResult(itp, 0, 'passed', { recordedBy: 'u-qaqc-2', inspection: released });
    expect(itp.points[0].history?.map((h) => [h.result, h.recordedBy])).toEqual([['failed', 'u-qaqc'], ['passed', 'u-qaqc-2']]);
    expect(() => recordPointResult(itp, 0, 'failed', { recordedBy: 'u-qaqc' })).toThrow(/has already passed — a passed point is final/);
  });
});
