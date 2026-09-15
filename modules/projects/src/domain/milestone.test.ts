import { describe, expect, it } from 'vitest';
import {
  achieveMilestone,
  clearMilestoneAchievement,
  makeProjectMilestone,
  resolveMilestone,
  type GatingActivity,
  type ProjectMilestone,
} from './milestone';
import { workingCalendarOf } from './working-calendar';

/**
 * A milestone is where a programme is most tempted to lie: the date is the thing management reads,
 * and everything behind it is out of sight. These tests are mostly about the four ways that happens
 * — a target that follows the plan, a sign-off against unfinished work, a missing forecast rounded
 * up to "on track", and a prediction reported with the confidence of a fact.
 */

const TODAY = '2026-03-16';

const milestone = (over: Partial<ProjectMilestone> = {}): ProjectMilestone => ({
  ...makeProjectMilestone({
    tenantId: 't1', projectId: 'p1', scheduleId: 's1',
    name: 'Level 1 containment complete', targetDate: '2026-03-20',
    gatingTaskIds: ['a', 'b'],
  }),
  ...over,
});

const gate = (over: Partial<GatingActivity> = {}): GatingActivity => ({
  taskId: 'a', name: 'Containment', percentComplete: 0, measured: true,
  forecastFinish: '2026-03-18', complete: false, ...over,
});

const resolve = (m: ProjectMilestone, gating: GatingActivity[], today = TODAY) =>
  resolveMilestone({ milestone: m, gating, today });

describe('authoring a milestone', () => {
  it('requires a name and a committed date', () => {
    expect(() => makeProjectMilestone({ tenantId: 't', projectId: 'p', scheduleId: 's', name: '  ', targetDate: '2026-03-20' }))
      .toThrow(/must be named/);
    expect(() => makeProjectMilestone({ tenantId: 't', projectId: 'p', scheduleId: 's', name: 'Energisation', targetDate: '20-03-2026' }))
      .toThrow(/YYYY-MM-DD/);
  });

  it('records the same gating activity once, however many times it was named', () => {
    // Two entries for one activity would make every count downstream read it as two.
    const m = makeProjectMilestone({
      tenantId: 't', projectId: 'p', scheduleId: 's', name: 'Energisation',
      targetDate: '2026-03-20', gatingTaskIds: ['a', 'b', 'a'],
    });
    expect(m.gatingTaskIds).toEqual(['a', 'b']);
  });

  it('starts with no achievement — absence, not a false zero', () => {
    const m = milestone();
    expect(m.achievedOn).toBeNull();
    expect(m.achievedBy).toBeNull();
  });
});

describe('where the milestone stands', () => {
  it('is ON_TRACK when the gating work is heading in on or before the committed date', () => {
    const view = resolve(milestone(), [gate({ forecastFinish: '2026-03-18' })]);
    expect(view).toMatchObject({ status: 'ON_TRACK', forecastDate: '2026-03-18', varianceWorkingDays: -2 });
  });

  it('is AT_RISK when the forecast lands after it, and says by how many working days', () => {
    const view = resolve(milestone(), [gate({ forecastFinish: '2026-03-24' })]);
    expect(view).toMatchObject({ status: 'AT_RISK', varianceWorkingDays: 4 });
  });

  it('forecasts from the LAST gating activity, not the first', () => {
    // A milestone is true when the last of the work behind it is done.
    const view = resolve(milestone(), [
      gate({ taskId: 'a', forecastFinish: '2026-03-17' }),
      gate({ taskId: 'b', forecastFinish: '2026-03-23' }),
    ]);
    expect(view.forecastDate).toBe('2026-03-23');
    expect(view.status).toBe('AT_RISK');
  });

  it('separates MISSED from AT_RISK — a date that passed is a fact, not a prediction', () => {
    // The forecast may still say next week; the committed day came and went regardless, and the
    // fact outranks the projection.
    const view = resolve(milestone({ targetDate: '2026-03-10' }), [gate({ forecastFinish: '2026-03-18' })]);
    expect(view.status).toBe('MISSED');
    expect(view.varianceWorkingDays).toBe(8);
  });

  it('counts the variance in WORKING days under the project calendar', () => {
    const weekends = workingCalendarOf(['2026-03-21', '2026-03-22', '2026-03-28', '2026-03-29']);
    const view = resolveMilestone({
      milestone: milestone({ targetDate: '2026-03-19' }),
      gating: [gate({ forecastFinish: '2026-03-24' })],
      today: TODAY,
      calendar: weekends,
    });
    // The 19th to the 24th is five calendar days but three working ones.
    expect(view.varianceWorkingDays).toBe(3);
  });

  it('names the gating activities so the date can be drilled into', () => {
    const view = resolve(milestone(), [gate({ taskId: 'a', name: 'Containment' }), gate({ taskId: 'b', name: 'Cabling' })]);
    expect(view.gating.map((activity) => activity.name)).toEqual(['Containment', 'Cabling']);
  });

  it('carries the measured/declared split, and never rounds it up', () => {
    const view = resolve(milestone(), [gate({ taskId: 'a', measured: true }), gate({ taskId: 'b', measured: false })]);
    expect(view.measuredGating).toBe(1);
    expect(view.gating.length).toBe(2);
  });
});

describe('what it refuses to claim', () => {
  it('is UNKNOWN when nothing in the programme gates it — not ON_TRACK', () => {
    // A date with no work behind it is a wish. Reading it as "on track" is the false confidence
    // this whole model exists to prevent.
    const view = resolve(milestone({ gatingTaskIds: [] }), []);
    expect(view.status).toBe('UNKNOWN');
    expect(view.varianceWorkingDays).toBeNull();
    expect(view.unknownReason).toMatch(/no activity in this programme gates this milestone/);
  });

  it('is UNKNOWN when the gating work cannot be placed', () => {
    // An unauthored duration somewhere behind it. Substituting one would produce a confident date
    // built on a number nobody chose.
    const view = resolve(milestone(), [gate({ forecastFinish: null })]);
    expect(view).toMatchObject({ status: 'UNKNOWN', forecastDate: null, varianceWorkingDays: null });
    expect(view.unknownReason).toMatch(/cannot be placed/);
  });

  it('reports no variance rather than zero where there is nothing to compare', () => {
    // "0 days late" is an answer; the absence of one is not.
    expect(resolve(milestone({ gatingTaskIds: [] }), []).varianceWorkingDays).toBeNull();
  });
});

describe('recording that it was met', () => {
  it('takes the day it happened, not the day it was typed', () => {
    // Signed off on site on Friday, entered on Monday: it was met on Friday.
    const m = achieveMilestone(milestone(), { on: '2026-03-13', by: 'u-pm', note: 'Signed by client', today: TODAY });
    expect(m).toMatchObject({ achievedOn: '2026-03-13', achievedBy: 'u-pm', achievedNote: 'Signed by client' });
    expect(m.achievedAt).not.toBeNull();
  });

  it('refuses a date that has not happened yet', () => {
    expect(() => achieveMilestone(milestone(), { on: '2026-03-20', today: TODAY }))
      .toThrow(/cannot be achieved on 2026-03-20, which has not happened yet/);
  });

  it('refuses to overwrite an achievement that is already on the record', () => {
    const met = achieveMilestone(milestone(), { on: '2026-03-13', today: TODAY });
    expect(() => achieveMilestone(met, { on: '2026-03-14', today: TODAY })).toThrow(/was already achieved/);
  });

  it('measures the achievement against the COMMITTED date', () => {
    // Met on the 13th against a target of the 20th: seven days early under a calendar that works
    // every day — and early against the COMMITMENT, not against whatever the plan says this morning.
    const met = achieveMilestone(milestone(), { on: '2026-03-13', today: TODAY });
    expect(resolve(met, [gate({ complete: true })])).toMatchObject({ status: 'ACHIEVED', varianceWorkingDays: -7 });
  });

  it('counts that variance under the project calendar too', () => {
    const weekends = workingCalendarOf(['2026-03-14', '2026-03-15']);
    const met = achieveMilestone(milestone(), { on: '2026-03-13', today: TODAY });
    // The same seven days, less the weekend nobody was going to work.
    expect(resolveMilestone({ milestone: met, gating: [gate({ complete: true })], today: TODAY, calendar: weekends }))
      .toMatchObject({ varianceWorkingDays: -5 });
  });
});

describe('an achievement recorded against work that is not finished', () => {
  // The commonest way a programme lies to management: the report goes green, the work is at forty
  // percent, and nothing anywhere says both things at once.
  const met = () => achieveMilestone(milestone(), { on: '2026-03-13', by: 'u-pm', today: TODAY });

  it('is recorded rather than refused — real milestones are accepted with snags', () => {
    const view = resolve(met(), [gate({ complete: true }), gate({ taskId: 'b', percentComplete: 40, complete: false })]);
    expect(view.status).toBe('ACHIEVED');
    expect(view.milestone.achievedOn).toBe('2026-03-13');
  });

  it('states the contradiction on every read, beside the achievement rather than instead of it', () => {
    const view = resolve(met(), [gate({ complete: true }), gate({ taskId: 'b', name: 'Cabling', percentComplete: 40 })]);
    expect(view.achievedAgainstIncompleteWork).toBe(true);
    expect(view.incompleteGating.map((activity) => activity.name)).toEqual(['Cabling']);
  });

  it('says nothing of the kind when the gating work really is finished', () => {
    const view = resolve(met(), [gate({ complete: true }), gate({ taskId: 'b', complete: true })]);
    expect(view.achievedAgainstIncompleteWork).toBe(false);
    expect(view.incompleteGating).toEqual([]);
  });

  it('keeps stating it for a milestone nothing gates, without inventing a contradiction', () => {
    // Nothing gating means nothing unfinished — an absence of evidence, not evidence of absence.
    const view = resolve(met(), []);
    expect(view.achievedAgainstIncompleteWork).toBe(false);
    expect(view.status).toBe('ACHIEVED');
  });
});

describe('withdrawing an achievement', () => {
  const met = () => achieveMilestone(milestone(), { on: '2026-03-13', by: 'u-pm', today: TODAY });

  it('requires a reason, because it has already been reported as met', () => {
    expect(() => clearMilestoneAchievement(met(), { reason: '   ', by: 'u-pm' })).toThrow(/requires a reason/);
  });

  it('puts the withdrawal and its reason on the record', () => {
    const cleared = clearMilestoneAchievement(met(), { reason: 'client rejected the snag list', by: 'u-pm' });
    expect(cleared.achievedOn).toBeNull();
    expect(cleared.achievedNote).toMatch(/withdrawn by u-pm: client rejected the snag list/);
  });

  it('returns the milestone to being judged on its forecast', () => {
    const cleared = clearMilestoneAchievement(met(), { reason: 'entered against the wrong milestone', by: 'u-pm' });
    expect(resolve(cleared, [gate({ forecastFinish: '2026-03-24' })]).status).toBe('AT_RISK');
  });

  it('refuses to withdraw one that was never recorded', () => {
    expect(() => clearMilestoneAchievement(milestone(), { reason: 'anything' }))
      .toThrow(/can only be withdrawn from a milestone that has one/);
  });
});
