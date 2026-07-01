import { describe, expect, it } from 'vitest';
import { reschedule, planSchedule } from './schedule-planning';

describe('schedule planning engine', () => {
  it('reschedules finish-to-start dependencies (CPM forward pass)', () => {
    const s = reschedule(
      [
        { id: 'a', name: 'Excavate', durationDays: 3 },
        { id: 'b', name: 'Foundation', durationDays: 4, dependencies: ['a'] },
        { id: 'c', name: 'Columns', durationDays: 2, dependencies: ['b'] },
      ],
      '2026-07-01',
    );
    expect(s.get('a')).toEqual({ start: '2026-07-01', end: '2026-07-03' });
    expect(s.get('b')).toEqual({ start: '2026-07-04', end: '2026-07-07' });
    expect(s.get('c')).toEqual({ start: '2026-07-08', end: '2026-07-09' });
  });

  it('honours lag and parallel branches; finish = latest branch', () => {
    const plan = planSchedule(
      [
        { id: 'a', name: 'A', durationDays: 2 },
        { id: 'b', name: 'B', durationDays: 5, dependencies: ['a'] },
        { id: 'c', name: 'C', durationDays: 1, dependencies: ['a'], lagDays: 2 },
      ],
      '2026-07-01',
    );
    // A: 1–2, B: 3–7 (critical), C: 3+2lag=5 only
    expect(plan.projectFinish).toBe('2026-07-07');
    expect(plan.criticalPath).toContain('a');
    expect(plan.criticalPath).toContain('b');
    expect(plan.criticalPath).not.toContain('c');
  });

  it('levels resources so daily capacity is not exceeded', () => {
    // Two independent 2-day tasks needing the same crew (capacity 1) must serialize.
    const plan = planSchedule(
      [
        { id: 't1', name: 'Task 1', durationDays: 2, resource: 'crew', resourceUnits: 1 },
        { id: 't2', name: 'Task 2', durationDays: 2, resource: 'crew', resourceUnits: 1 },
      ],
      '2026-07-01',
      { crew: 1 },
    );
    const t1 = plan.tasks.find((t) => t.id === 't1')!;
    const t2 = plan.tasks.find((t) => t.id === 't2')!;
    // They must not overlap on the single-capacity crew.
    expect(t1.end < t2.start || t2.end < t1.start).toBe(true);
    const crew = plan.resourcePeaks.find((r) => r.resource === 'crew')!;
    expect(crew.peakUnits).toBeLessThanOrEqual(1);
    expect(crew.overallocated).toBe(false);
  });

  it('flags over-allocation when capacity is not provided as a constraint', () => {
    const plan = planSchedule(
      [
        { id: 't1', name: 'T1', durationDays: 2, resource: 'crane', resourceUnits: 1 },
        { id: 't2', name: 'T2', durationDays: 2, resource: 'crane', resourceUnits: 1 },
      ],
      '2026-07-01',
      // no capacity for 'crane' → not leveled, peak = 2
    );
    const crane = plan.resourcePeaks.find((r) => r.resource === 'crane')!;
    expect(crane.peakUnits).toBe(2);
  });

  it('detects dependency cycles', () => {
    expect(() =>
      reschedule(
        [
          { id: 'a', name: 'A', durationDays: 1, dependencies: ['b'] },
          { id: 'b', name: 'B', durationDays: 1, dependencies: ['a'] },
        ],
        '2026-07-01',
      ),
    ).toThrow(/cycle/);
  });
});
