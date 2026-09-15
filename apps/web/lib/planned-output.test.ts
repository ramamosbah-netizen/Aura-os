import { describe, expect, it } from 'vitest';
import { behindCount, outputOf, outputSummary, soldAndInstalled, type PlannedOutput } from './planned-output';

/**
 * The one phrasing every screen uses. What is worth pinning is the RESTRAINT: an activity with no
 * award line behind it says nothing at all, because printing "unknown" under every bar is how a
 * reader learns to stop reading the ones that matter.
 */

const output = (over: Partial<PlannedOutput> = {}): PlannedOutput => ({
  plannedQuantity: 200, unit: 'm2', installedQuantity: 60,
  basis: { crewSize: 2, manHoursPerUnit: 1, crewHoursPerUnit: 0.5, engineerManHoursPerUnit: 0, projectManagerManHoursPerUnit: 0, estimateId: 'est-1' },
  pricedRatePerDay: 16, pricedCrewDays: 12.5, achievedRatePerDay: 6, requiredRatePerDay: 14,
  expectedByNow: 160, verdict: 'BEHIND', unknownReason: null, ...over,
});

describe('saying what the progress is measured against', () => {
  it('names the pace, the priced pace and what it would now take to recover', () => {
    expect(outputSummary(output())).toMatchObject({
      tone: 'BEHIND',
      text: 'Behind the priced rate · 6 m2/day against 16 m2/day priced · 14 m2/day needed to finish in the window',
    });
  });

  it('says ahead and on-rate without demanding anything', () => {
    expect(outputSummary(output({ verdict: 'AHEAD', achievedRatePerDay: 19 }))?.text)
      .toBe('Ahead of the priced rate · 19 m2/day against 16 m2/day priced');
    expect(outputSummary(output({ verdict: 'ON_RATE', achievedRatePerDay: 16 }))?.text)
      .toBe('At the priced rate · 16 m2/day against 16 m2/day priced');
  });

  it('says the reason out loud rather than rounding an unknown to "on track"', () => {
    const unknown = outputSummary(output({ verdict: 'UNKNOWN', unknownReason: 'no crew was priced for this award line', achievedRatePerDay: 6, pricedRatePerDay: null }));
    expect(unknown).toMatchObject({ tone: 'UNKNOWN' });
    expect(unknown?.text).toContain('no crew was priced');
  });

  it('stays silent where the activity has no award line behind it at all', () => {
    // The ordinary case for most activities, and not news.
    expect(outputSummary(output({ verdict: 'UNKNOWN', plannedQuantity: null, unknownReason: 'no award line' }))).toBeNull();
    expect(outputSummary(null)).toBeNull();
  });
});

describe('what was sold against what is in', () => {
  it('reads the quantities, and separates nothing-measured from nothing-installed', () => {
    expect(soldAndInstalled(output())).toBe('60 of 200 m2 installed');
    expect(soldAndInstalled(output({ installedQuantity: 0 }))).toBe('0 of 200 m2 installed');
    // Not "0 installed": nobody has measured, which is a different fact.
    expect(soldAndInstalled(output({ installedQuantity: null }))).toBe('200 m2 sold · nothing measured yet');
    expect(soldAndInstalled(output({ plannedQuantity: null }))).toBeNull();
  });
});

describe('the headline count', () => {
  it('counts only the activities actually losing ground', () => {
    const schedules = [{
      output: { a: output(), b: output({ verdict: 'AHEAD' }), c: output({ verdict: 'UNKNOWN' }) },
      tasks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    }];
    expect(behindCount(schedules)).toBe(1);
    // An unknown is never counted as behind — the system does not get to guess in either direction.
    expect(behindCount([{ tasks: [{ id: 'a' }] }])).toBe(0);
  });

  it("reads one activity's output, and nothing for an activity with no id", () => {
    const schedule = { output: { a: output() } };
    expect(outputOf(schedule, { id: 'a' })?.verdict).toBe('BEHIND');
    expect(outputOf(schedule, { id: 'zz' })).toBeNull();
    expect(outputOf(schedule, {})).toBeNull();
    expect(outputOf(null, { id: 'a' })).toBeNull();
  });
});
