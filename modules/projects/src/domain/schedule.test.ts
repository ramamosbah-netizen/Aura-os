import { describe, it, expect } from 'vitest';
import { makeProjectSchedule, setBaseline, setScheduleTasks, summariseSchedule } from './schedule';

const base = { tenantId: 't1', projectId: 'p1', projectName: 'Marina' };
const tasks = [
  { name: 'Mobilise', plannedStart: '2026-01-01', plannedEnd: '2026-01-10', percentComplete: 100 },
  { name: 'Cabling', plannedStart: '2026-01-11', plannedEnd: '2026-01-30', percentComplete: 50 },
  { name: 'Commission', plannedStart: '2026-02-01', plannedEnd: '2026-02-10', percentComplete: 0 },
];

describe('project schedule domain', () => {
  it('sorts tasks, validates dates + percent', () => {
    const s = makeProjectSchedule({ ...base, tasks });
    expect(s.tasks[0].name).toBe('Mobilise');
    expect(() => makeProjectSchedule({ ...base, tasks: [{ name: 'x', plannedStart: '2026-02-01', plannedEnd: '2026-01-01' }] })).toThrow('on/after');
    expect(() => makeProjectSchedule({ ...base, tasks: [{ name: 'x', plannedStart: '2026-01-01', plannedEnd: '2026-01-02', percentComplete: 150 }] })).toThrow('0..100');
  });

  it('summary: span, duration-weighted % complete, no variance pre-baseline', () => {
    const sm = summariseSchedule(makeProjectSchedule({ ...base, tasks }));
    expect(sm.plannedStart).toBe('2026-01-01');
    expect(sm.plannedEnd).toBe('2026-02-10');
    expect(sm.baselineSet).toBe(false);
    expect(sm.scheduleVarianceDays).toBe(0);
    expect(sm.percentComplete).toBeGreaterThan(0);
  });

  it('baseline snapshots planned; slipping a task shows positive variance', () => {
    let s = setBaseline(makeProjectSchedule({ ...base, tasks }));
    expect(s.baselineSetAt).not.toBeNull();
    expect(summariseSchedule(s).scheduleVarianceDays).toBe(0);
    // slip commissioning end by 5 days (baseline preserved by name)
    s = setScheduleTasks(s, tasks.map((t) => t.name === 'Commission' ? { ...t, plannedEnd: '2026-02-15' } : t));
    expect(summariseSchedule(s).scheduleVarianceDays).toBe(5);
  });
});
