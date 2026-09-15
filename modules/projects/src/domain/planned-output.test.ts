import { describe, expect, it } from 'vitest';
import { productivityBasisFrom, resolvePlannedOutput } from './planned-output';
import { workingCalendarOf } from './working-calendar';

/**
 * Measured against WHAT. Every unknown below is a fact nobody stated, and the point of each test
 * is that it comes back as UNKNOWN carrying its reason rather than as a verdict the system cannot
 * support — "on rate" against a rate nobody priced is the failure mode this file exists to stop.
 */

// 2 technicians × 100 hours each, for 200 m² → 1 man-hour/m², 0.5 crew-hours/m² → 16 m²/day.
const basis = productivityBasisFrom(
  { technician: { count: 2, hours: 100 }, engineer: { count: 1, hours: 20 } }, 200, 'est-1');

const line = (over: Record<string, unknown> = {}) => ({ soldQuantity: 200, unit: 'm2', productivityBasis: basis, ...over });
const at = (over: Partial<Parameters<typeof resolvePlannedOutput>[0]> = {}) => resolvePlannedOutput({
  frozen: line(), installedQuantity: 0, plannedStart: '2026-09-01', plannedEnd: '2026-09-20', today: '2026-09-10', ...over,
});

describe('reading what was sold and priced', () => {
  it('normalises the per-line manpower sheet to one unit, so a later revision cannot distort it', () => {
    expect(basis).toMatchObject({
      crewSize: 2,
      manHoursPerUnit: 1,        // 2 × 100 ÷ 200
      crewHoursPerUnit: 0.5,     // …with two working in parallel
      engineerManHoursPerUnit: 0.1,
      projectManagerManHoursPerUnit: 0,
      estimateId: 'est-1',
    });
  });

  it('keeps supervision out of the crew that sets the rate', () => {
    // An engineer's hours must not make the crew look bigger and the work look faster.
    const supervised = productivityBasisFrom({ technician: { count: 2, hours: 100 }, projectManager: { count: 1, hours: 50 } }, 200, null);
    expect(supervised).toMatchObject({ crewSize: 2, crewHoursPerUnit: 0.5, projectManagerManHoursPerUnit: 0.25 });
  });

  it('returns no basis at all where nothing was priced — never a basis of zero', () => {
    expect(productivityBasisFrom(null, 200, null)).toBeNull();
    expect(productivityBasisFrom({}, 200, null)).toBeNull();
    expect(productivityBasisFrom({ technician: { count: 0, hours: 0 } }, 200, null)).toBeNull();
    // A quantity nobody can divide by cannot produce a per-unit figure either.
    expect(productivityBasisFrom({ technician: { count: 2, hours: 100 } }, 0, null)).toBeNull();
  });
});

describe('the rate the work is going at', () => {
  it('reads the priced rate and the days it was sold to take', () => {
    const output = at();
    expect(output).toMatchObject({ plannedQuantity: 200, unit: 'm2', pricedRatePerDay: 16, pricedCrewDays: 12.5 });
  });

  it('calls the work behind when less is installed than the priced rate would have put in', () => {
    // 10 of 20 days used; 16/day priced → 160 expected; 60 installed is 6/day.
    const output = at({ installedQuantity: 60 });
    expect(output).toMatchObject({ verdict: 'BEHIND', achievedRatePerDay: 6, expectedByNow: 160, unknownReason: null });
    // What it would now take to still finish inside the window: 140 left over 10 days.
    expect(output.requiredRatePerDay).toBe(14);
  });

  it('calls it ahead, and on rate inside a tolerance measurement cannot see past', () => {
    expect(at({ installedQuantity: 190 }).verdict).toBe('AHEAD');
    expect(at({ installedQuantity: 160 }).verdict).toBe('ON_RATE');
    expect(at({ installedQuantity: 155 }).verdict).toBe('ON_RATE');
    expect(at({ installedQuantity: 140 }).verdict).toBe('BEHIND');
  });

  it('never expects more than was sold, however long the window runs', () => {
    // 20 days at 16/day would be 320 — but only 200 was ever sold.
    const output = at({ today: '2026-09-20', installedQuantity: 200 });
    expect(output.expectedByNow).toBe(200);
    // …and finished work demands nothing further, which is not the same as a rate of zero.
    expect(output.requiredRatePerDay).toBe(0);
  });

  it('counts both ends of the window, so a one-day activity is one day', () => {
    const output = resolvePlannedOutput({
      frozen: line(), installedQuantity: 16, plannedStart: '2026-09-01', plannedEnd: '2026-09-01', today: '2026-09-01',
    });
    expect(output.achievedRatePerDay).toBe(16);
  });
});

describe('counting the days the crew was actually asked to work', () => {
  // Two weekends inside the window, and the same two inside the elapsed part.
  const weekends = workingCalendarOf(['2026-09-05', '2026-09-06', '2026-09-12', '2026-09-13', '2026-09-19', '2026-09-20']);

  it('does not charge a crew for the Fridays nobody asked them to work', () => {
    // Ten calendar days gone, two of them a weekend: eight working days, not ten.
    const output = at({ installedQuantity: 60, calendar: weekends });
    expect(output).toMatchObject({ achievedRatePerDay: 7.5, expectedByNow: 128, verdict: 'BEHIND' });
    // Without a calendar the same crew reads slower, on days it was never asked to be there.
    expect(at({ installedQuantity: 60 })).toMatchObject({ achievedRatePerDay: 6, expectedByNow: 160 });
  });

  it('counts what is LEFT of the window in working days too', () => {
    // 14 working days in the window, 8 used, 6 left; 140 left to install → 23.33/day.
    expect(at({ installedQuantity: 60, calendar: weekends }).requiredRatePerDay).toBe(23.33);
  });

  it('says nothing about a window that is entirely shut down', () => {
    const shutdown = workingCalendarOf(['2026-09-01', '2026-09-02', '2026-09-03']);
    const output = resolvePlannedOutput({
      frozen: line(), installedQuantity: 0, plannedStart: '2026-09-01', plannedEnd: '2026-09-03',
      today: '2026-09-03', calendar: shutdown,
    });
    // No work was ever asked for across it, so no rate can be owed — and it is not "behind".
    expect(output).toMatchObject({ verdict: 'UNKNOWN', achievedRatePerDay: null });
    expect(output.unknownReason).toMatch(/every day of this activity/);
  });
});

describe('what it refuses to have an opinion about', () => {
  it('says nothing about a work package with no award line behind it', () => {
    const output = resolvePlannedOutput({
      frozen: null, installedQuantity: 40, plannedStart: '2026-09-01', plannedEnd: '2026-09-20', today: '2026-09-10',
    });
    expect(output).toMatchObject({ verdict: 'UNKNOWN', plannedQuantity: null });
    expect(output.unknownReason).toMatch(/no award line/);
  });

  it('says nothing where nothing is measured — an unmeasured package is not a package at zero', () => {
    const output = at({ installedQuantity: null });
    expect(output).toMatchObject({ verdict: 'UNKNOWN', installedQuantity: null, pricedRatePerDay: 16 });
    expect(output.unknownReason).toMatch(/nothing is measured/);
  });

  it('refuses to judge an achieved rate against a rate nobody priced', () => {
    // A fully subcontracted line. The window still implies a pace, and the figure is returned —
    // but it is the plan agreeing with itself, so it is never dressed up as a verdict.
    const output = at({ frozen: line({ productivityBasis: null }), installedQuantity: 60 });
    expect(output).toMatchObject({ verdict: 'UNKNOWN', pricedRatePerDay: null, achievedRatePerDay: 6, expectedByNow: 100 });
    expect(output.unknownReason).toMatch(/no crew was priced/);
  });

  it('says nothing before the window opens, and does not call that "behind"', () => {
    const output = at({ today: '2026-08-25', installedQuantity: 0 });
    expect(output).toMatchObject({ verdict: 'UNKNOWN', achievedRatePerDay: null });
    expect(output.unknownReason).toMatch(/has not opened/);
    // The demand over the whole window is still knowable, and is still stated.
    expect(output.requiredRatePerDay).toBe(10);
  });

  it('says nothing about an activity with no usable window, or a line with no sold quantity', () => {
    expect(at({ plannedEnd: '2026-08-01' }).unknownReason).toMatch(/no usable planned window/);
    expect(at({ plannedStart: 'soon' }).unknownReason).toMatch(/no usable planned window/);
    expect(at({ frozen: line({ soldQuantity: null }) }).unknownReason).toMatch(/no sold quantity/);
    expect(at({ frozen: line({ soldQuantity: 0 }) }).unknownReason).toMatch(/no sold quantity/);
  });

  it('keeps every fact it does know beside the reason it cannot answer', () => {
    // The unknown is about the verdict, not about the evidence — a screen should still be able to
    // show what was sold and what was priced while saying it cannot judge the pace.
    const output = at({ installedQuantity: null });
    expect(output.plannedQuantity).toBe(200);
    expect(output.unit).toBe('m2');
    expect(output.basis).toMatchObject({ crewSize: 2 });
  });
});
