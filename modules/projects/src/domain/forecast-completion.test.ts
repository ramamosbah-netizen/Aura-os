import { describe, expect, it } from 'vitest';
import { forecastCompletion, remainingWorkingDays, type ForecastInput } from './forecast-completion';
import { workingCalendarOf } from './working-calendar';

/**
 * A "forecast" that repeats the planned finish is not a forecast; it is the plan with a new label,
 * and it is the most common lie a project system tells. These tests are mostly about the two things
 * that stop it being one: remaining duration derived from what was actually built, and a confidence
 * figure that travels with the date and is never rounded up.
 */

// A → B → C, four working days each, all unstarted. Monday 2026-03-09.
const chain = (over: Partial<Record<'a' | 'b' | 'c', Partial<ForecastInput['tasks'][number]>>> = {}): ForecastInput['tasks'] => ([
  { id: 'a', name: 'Containment', plannedStart: '2026-03-09', plannedEnd: '2026-03-12', durationWorkingDays: 4, percentComplete: 0, measured: true, ...over.a },
  { id: 'b', name: 'Cabling', plannedStart: '2026-03-13', plannedEnd: '2026-03-16', durationWorkingDays: 4, percentComplete: 0, measured: true, ...over.b },
  { id: 'c', name: 'Termination', plannedStart: '2026-03-17', plannedEnd: '2026-03-20', durationWorkingDays: 4, percentComplete: 0, measured: true, ...over.c },
]);
const edges = [
  { predecessorTaskId: 'a', successorTaskId: 'b' },
  { predecessorTaskId: 'b', successorTaskId: 'c' },
];

const at = (over: Partial<ForecastInput> = {}) => forecastCompletion({
  tasks: chain(), dependencies: edges, projectStart: '2026-03-09', baselineFinish: '2026-03-20', ...over,
});

describe('what is left of an activity', () => {
  it('takes off what has been done', () => {
    expect(remainingWorkingDays(4, 0)).toBe(4);
    expect(remainingWorkingDays(4, 50)).toBe(2);
    expect(remainingWorkingDays(4, 100)).toBe(0);
  });

  it('rounds what is left UP, because half a day of work is a day somebody turns up for', () => {
    // A forecast must never be wrong in the optimistic direction.
    expect(remainingWorkingDays(5, 50)).toBe(3);
    expect(remainingWorkingDays(3, 90)).toBe(1);
  });

  it('says nothing about an activity whose duration nobody authored', () => {
    // Not zero remaining: nobody said how long it takes, so nobody can say what is left.
    expect(remainingWorkingDays(null, 50)).toBeNull();
  });

  it('treats nonsense progress as the bounds allow, rather than inverting the arithmetic', () => {
    expect(remainingWorkingDays(4, 150)).toBe(0);
    expect(remainingWorkingDays(4, -20)).toBe(4);
  });
});

describe('where the project is actually heading', () => {
  it('forecasts the planned finish when nothing has started and nothing has slipped', () => {
    const forecast = at();
    expect(forecast).toMatchObject({
      plannedFinish: '2026-03-20', forecastFinish: '2026-03-20', baselineFinish: '2026-03-20',
      varianceWorkingDays: 0, planOptimismWorkingDays: 0,
    });
  });

  it('pulls the date IN when work is genuinely ahead of the plan', () => {
    // Half of the first two activities done: four working days of work no longer to do.
    const forecast = at({ tasks: chain({ a: { percentComplete: 50 }, b: { percentComplete: 50 } }) });
    expect(forecast.forecastFinish! < '2026-03-20').toBe(true);
    expect(forecast.varianceWorkingDays).toBeLessThan(0);
  });

  it('counts the variance against the BASELINE, not against the plan', () => {
    // The plan may have been edited since; the baseline is the thing that was committed to.
    const forecast = at({ baselineFinish: '2026-03-17' });
    expect(forecast).toMatchObject({ baselineFinish: '2026-03-17', varianceWorkingDays: 3 });
  });

  it('says how much the plan is flattering itself, separately from the baseline variance', () => {
    // An activity whose duration the plan does not allow for: the forecast lands past the planned
    // finish even though nothing about the baseline has changed.
    const stretched = chain({ a: { durationWorkingDays: 9 } });
    const forecast = at({ tasks: stretched });
    expect(forecast.planOptimismWorkingDays).toBe(5);
    expect(forecast.varianceWorkingDays).toBe(5);
  });

  it('counts both figures in WORKING days under the project calendar', () => {
    const weekends = workingCalendarOf(['2026-03-13', '2026-03-14', '2026-03-20', '2026-03-21', '2026-03-27', '2026-03-28']);
    const nonWorking = ['2026-03-13', '2026-03-14', '2026-03-20', '2026-03-21', '2026-03-27', '2026-03-28'];
    const forecast = at({ calendar: weekends, nonWorkingDays: nonWorking, baselineFinish: '2026-03-24' });
    // Twelve working days from Monday the 9th, stepping over two weekends, lands on the 24th…
    expect(forecast.forecastFinish).toBe('2026-03-24');
    expect(forecast.varianceWorkingDays).toBe(0);
  });

  it('names the activities that decide the date, in the order they run', () => {
    const forecast = at();
    expect(forecast.contributors.map((contributor) => contributor.name)).toEqual(['Containment', 'Cabling', 'Termination']);
    expect(forecast.contributors[0]).toMatchObject({
      durationWorkingDays: 4, remainingWorkingDays: 4, percentComplete: 0, onCriticalPath: true,
    });
  });
});

describe('how much the date is worth', () => {
  it('is MEASURED only when every activity with work left carries measured progress', () => {
    expect(at()).toMatchObject({ confidence: 'MEASURED', measuredDrivers: 3, driverCount: 3 });
  });

  it('is DECLARED when none of them does — a guess wearing a projection’s clothes', () => {
    const declared = chain({ a: { measured: false }, b: { measured: false }, c: { measured: false } });
    expect(at({ tasks: declared })).toMatchObject({ confidence: 'DECLARED', measuredDrivers: 0, driverCount: 3 });
  });

  it('is PARTLY_MEASURED when some are, and never rounds that up', () => {
    const mixed = chain({ b: { measured: false } });
    expect(at({ tasks: mixed })).toMatchObject({ confidence: 'PARTLY_MEASURED', measuredDrivers: 2, driverCount: 3 });
  });

  it('stops counting an activity that is finished — its evidence no longer moves the date', () => {
    // A declared 100% contributes no remaining work, so it is not a driver of the forecast and
    // cannot drag the confidence down for a date it has no say in.
    const done = chain({ a: { percentComplete: 100, measured: false } });
    expect(at({ tasks: done })).toMatchObject({ confidence: 'MEASURED', driverCount: 2 });
  });
});

describe('what it refuses to forecast', () => {
  it('says nothing about a programme with no activities', () => {
    expect(at({ tasks: [] }).unknownReason).toMatch(/no activities to forecast/);
  });

  it('says nothing when an activity has no authored duration to place', () => {
    // Substituting one would produce a confident date built on a number nobody chose.
    const unplaceable = chain({ b: { durationWorkingDays: null } });
    const forecast = at({ tasks: unplaceable });
    expect(forecast).toMatchObject({ confidence: 'UNKNOWN', forecastFinish: null });
    expect(forecast.unknownReason).toMatch(/cannot be placed/);
    // …while still reporting the two dates it does know.
    expect(forecast).toMatchObject({ plannedFinish: '2026-03-20', baselineFinish: '2026-03-20' });
  });

  it('states no variance where nothing was ever committed to', () => {
    // A project with no baseline has nothing to be late against, and saying "0 days late" would be
    // an answer rather than the absence of one.
    const forecast = at({ baselineFinish: null });
    expect(forecast.varianceWorkingDays).toBeNull();
    expect(forecast.forecastFinish).toBe('2026-03-20');
  });
});
