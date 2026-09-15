import { describe, expect, it } from 'vitest';
import { resolveLabourProductivity, type ProjectLabourSpent } from './labour-productivity';

/**
 * Three quantities of hours that must never be mistaken for each other: priced, earned and spent.
 * Every UNKNOWN below is a fact nobody wrote down — and the one that matters most is "no hours
 * attributed", which is not infinite productivity however convenient that would be.
 */

// 1 man-hour per unit, priced.
const basis = {
  crewSize: 2, manHoursPerUnit: 1, crewHoursPerUnit: 0.5,
  engineerManHoursPerUnit: 0, projectManagerManHoursPerUnit: 0, estimateId: 'est-1',
};

const spent = (onPackage: number, unattributed = 0, otherPackages = 0): ProjectLabourSpent => ({
  byWorkPackage: new Map([['wbs-1', onPackage], ['wbs-2', otherPackages]]),
  unattributedManHours: unattributed,
  totalManHours: onPackage + otherPackages + unattributed,
});

const at = (over: Partial<Parameters<typeof resolveLabourProductivity>[0]> = {}) => resolveLabourProductivity({
  basis, installedQuantity: 100, spent: spent(100), wbsNodeId: 'wbs-1', ...over,
});

describe('what the installed work actually cost in hours', () => {
  it('sets the hours the work earned against the hours somebody wrote down', () => {
    // 100 units installed at 1 priced man-hour each = 100 earned, against 100 spent.
    expect(at()).toMatchObject({ earnedManHours: 100, spentManHours: 100, factor: 1, verdict: 'AS_PRICED' });
  });

  it('calls it worse than priced when the work took more hours than were sold into it', () => {
    const worse = at({ spent: spent(200) });
    expect(worse).toMatchObject({ factor: 0.5, verdict: 'WORSE_THAN_PRICED', earnedManHours: 100, spentManHours: 200 });
  });

  it('calls it better than priced, and allows a band a day sheet cannot see past', () => {
    expect(at({ spent: spent(50) }).verdict).toBe('BETTER_THAN_PRICED');
    expect(at({ spent: spent(105) }).verdict).toBe('AS_PRICED');
    expect(at({ spent: spent(92) }).verdict).toBe('AS_PRICED');
    expect(at({ spent: spent(130) }).verdict).toBe('WORSE_THAN_PRICED');
  });

  it('keeps the pace question and the cost question apart', () => {
    // Half the work done, but every hour spent on it was a priced hour. Behind on the programme,
    // and not wasteful — two different facts, and this file only answers the second.
    expect(at({ installedQuantity: 50, spent: spent(50) })).toMatchObject({ factor: 1, verdict: 'AS_PRICED' });
  });
});

describe('the hours that name no work package', () => {
  it('travels with the figure, because the figure ignored them', () => {
    // 100 on the package, 60 on another, 240 naming nothing: the factor is computed on 100 of 400.
    const output = at({ spent: spent(100, 240, 60) });
    expect(output).toMatchObject({ factor: 1, unattributedManHours: 240, unattributedShare: 0.6 });
  });

  it('is reported even when no factor can be given at all', () => {
    // A reader deciding whether to trust ANY of this project's productivity figures needs this
    // first, so it survives every unknown below it.
    const unpriced = at({ basis: null, spent: spent(100, 240, 60) });
    expect(unpriced).toMatchObject({ verdict: 'UNKNOWN', unattributedManHours: 240, unattributedShare: 0.6 });
    const unmeasured = at({ installedQuantity: null, spent: spent(100, 240, 60) });
    expect(unmeasured).toMatchObject({ verdict: 'UNKNOWN', unattributedManHours: 240, unattributedShare: 0.6 });
  });

  it('reports no share where nothing at all has been recorded, rather than a tidy zero', () => {
    const output = at({ spent: { byWorkPackage: new Map(), unattributedManHours: 0, totalManHours: 0 } });
    expect(output.unattributedShare).toBeNull();
    expect(output.unattributedManHours).toBe(0);
  });
});

describe('what it refuses to have an opinion about', () => {
  it('does not call an unattributed package infinitely productive', () => {
    // The whole trap. 100 units installed, nobody wrote down a single hour against the package.
    const output = at({ spent: spent(0, 300, 200) });
    expect(output.verdict).toBe('UNKNOWN');
    expect(output.unknownReason).toMatch(/no labour has been attributed/);
    // …and it still says what the work should have taken, so the gap is visible rather than blank.
    expect(output).toMatchObject({ earnedManHours: 100, spentManHours: 0, factor: null });
  });

  it('says nothing where no crew was priced, and nothing where nothing was measured', () => {
    expect(at({ basis: null }).unknownReason).toMatch(/no crew was priced/);
    expect(at({ basis: { ...basis, manHoursPerUnit: 0 } }).unknownReason).toMatch(/no crew was priced/);
    expect(at({ installedQuantity: null }).unknownReason).toMatch(/nothing is measured/);
  });

  it('says nothing when hours were spent before anything was installed', () => {
    // Real and common — setting out, first fix, a week before the first measure. It is not a
    // productivity of zero, and reporting it as one would condemn every package at its start.
    const output = at({ installedQuantity: 0, spent: spent(80) });
    expect(output).toMatchObject({ verdict: 'UNKNOWN', spentManHours: 80, earnedManHours: 0, factor: null });
    expect(output.unknownReason).toMatch(/no hours have been earned/);
  });

  it('says nothing at all when no labour source is bound to this composition', () => {
    const output = at({ spent: null });
    expect(output).toMatchObject({ verdict: 'UNKNOWN', spentManHours: null, unattributedManHours: null });
    expect(output.unknownReason).toMatch(/no labour records are available/);
  });

  it('treats an activity with no work package as having nothing attributed to it', () => {
    const output = at({ wbsNodeId: null, spent: spent(100, 10) });
    expect(output.verdict).toBe('UNKNOWN');
    expect(output.unknownReason).toMatch(/no labour has been attributed/);
  });
});
