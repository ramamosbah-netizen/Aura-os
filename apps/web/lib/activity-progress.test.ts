import { describe, expect, it } from 'vitest';
import { activityProgress, isMeasured, measuredNote, progressSource, type ProgressBearingSchedule } from './activity-progress';

/**
 * One definition, used by five screens. The thing worth pinning is the FALLBACK: a surface reading
 * a payload without the map must show the declared number it always showed — never a silent zero,
 * which would read as "nothing has been done" when it means "this screen was not told".
 */

const measured = { effective: 75, source: 'evidence' as const, evidence: 75, override: null };
const stated = { effective: 90, source: 'override' as const, evidence: 75, override: { value: 90, reason: 'ahead of measure', at: '2026-09-01T00:00:00.000Z', by: 'u-pm' } };
const declared = { effective: 40, source: 'declared' as const, evidence: null, override: null };

describe('the figure a screen shows for an activity', () => {
  it('prefers the resolved figure over the number typed on the activity', () => {
    const schedule = { progress: { 't1': measured } };
    expect(activityProgress(schedule, { id: 't1', percentComplete: 10 })).toBe(75);
    expect(activityProgress({ progress: { 't1': stated } }, { id: 't1', percentComplete: 10 })).toBe(90);
  });

  it('falls back to the declared number, not to zero, when the map is absent', () => {
    // An older payload, a narrower endpoint, or a plan read before this existed.
    expect(activityProgress({}, { id: 't1', percentComplete: 40 })).toBe(40);
    expect(activityProgress(null, { id: 't1', percentComplete: 40 })).toBe(40);
    expect(activityProgress({ progress: { 'other': measured } }, { id: 't1', percentComplete: 40 })).toBe(40);
    expect(activityProgress({ progress: { 't1': measured } }, { percentComplete: 40 })).toBe(40);
  });

  it('separates a measured figure from a typed one', () => {
    expect(isMeasured({ progress: { 't1': measured } }, { id: 't1' })).toBe(true);
    expect(isMeasured({ progress: { 't1': stated } }, { id: 't1' })).toBe(true);
    expect(isMeasured({ progress: { 't1': declared } }, { id: 't1' })).toBe(false);
    expect(isMeasured({}, { id: 't1' })).toBe(false);
  });

  it('says where the number came from, keeping the measurement beside a claim', () => {
    expect(progressSource({ progress: { 't1': measured } }, { id: 't1' })).toBe('Measured from installed quantity');
    expect(progressSource({ progress: { 't1': stated } }, { id: 't1' })).toBe('Stated against a measured 75%');
    expect(progressSource({ progress: { 't1': declared } }, { id: 't1' })).toBe('Declared');
    expect(progressSource(undefined, { id: 't1' })).toBe('Declared');
  });
});

describe('what a headline percentage is made of', () => {
  it('counts the measured activities against the total', () => {
    const schedules: Array<ProgressBearingSchedule & { tasks: Array<{ id?: string | null }> }> = [
      { progress: { a: measured, b: declared }, tasks: [{ id: 'a' }, { id: 'b' }] },
      { progress: { c: stated }, tasks: [{ id: 'c' }] },
    ];
    expect(measuredNote(schedules)).toBe('2 of 3 measured from site quantity');
  });

  it('says plainly when an average is entirely asserted', () => {
    expect(measuredNote([{ progress: { a: declared }, tasks: [{ id: 'a' }] }])).toBe('declared — none measured from site quantity');
    expect(measuredNote([{ tasks: [{ id: 'a' }] }])).toBe('declared — none measured from site quantity');
  });

  it('does not call an empty plan zero per cent measured', () => {
    expect(measuredNote([])).toBe('not established');
    expect(measuredNote([{ tasks: [] }])).toBe('not established');
  });
});
