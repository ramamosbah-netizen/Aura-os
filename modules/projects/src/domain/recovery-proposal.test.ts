import { describe, expect, it } from 'vitest';
import { compareRecovery } from './recovery-proposal';
import { workingCalendarOf } from './working-calendar';

/**
 * A recovery proposal is a scenario, and the figure it is judged on is the comparison rather than
 * its own finish date. The two cases a screen must not round away are a proposal that recovers
 * nothing and one that is worse than the programme it would replace.
 */

const at = (over: Partial<Parameters<typeof compareRecovery>[0]> = {}) => compareRecovery({
  currentFinish: '2026-03-20', proposedFinish: '2026-03-17', established: true, ...over,
});

describe('what a proposal would recover', () => {
  it('counts the working days between the two finishes', () => {
    // 17th to 20th is three days apart, exclusive of the earlier one.
    expect(at()).toMatchObject({ workingDaysRecovered: 3, verdict: 'RECOVERS_TIME' });
  });

  it('counts them under the project calendar, so a week across a shutdown recovers less', () => {
    const weekends = workingCalendarOf(['2026-03-20', '2026-03-21', '2026-03-13', '2026-03-14']);
    // The 20th is not worked, so moving off it to the 17th wins two working days, not three.
    expect(at({ calendar: weekends }).workingDaysRecovered).toBe(2);
  });

  it('says plainly that a re-plan found nothing, rather than implying it helped', () => {
    const output = at({ proposedFinish: '2026-03-20' });
    expect(output).toMatchObject({ workingDaysRecovered: 0, verdict: 'NO_CHANGE' });
    expect(output.unknownReason).toBeNull();
  });

  it('reports a proposal that is WORSE than the programme it would replace', () => {
    // The one nobody should accept by reflex, and the one a screen showing only a finish date hides.
    expect(at({ proposedFinish: '2026-03-25' })).toMatchObject({ workingDaysRecovered: -5, verdict: 'LOSES_TIME' });
  });

  it('carries the delay it was prepared for, and that delay’s assessed impact', () => {
    // Frozen at the hand-off, and deliberately not derived from the recovery figure: "assessed at
    // 6 days lost, this recovers 3" is two separate assessments that are allowed to disagree.
    const output = at({ sourceDelayId: 'delay-1', sourceAssessmentImpactDays: 6 });
    expect(output).toMatchObject({ sourceDelayId: 'delay-1', sourceAssessmentImpactDays: 6, workingDaysRecovered: 3 });
  });

  it('carries no lineage for an ordinary re-plan, which is not less legitimate', () => {
    expect(at()).toMatchObject({ sourceDelayId: null, sourceAssessmentImpactDays: null });
  });
});

describe('what it refuses to put a number on', () => {
  it('says nothing when the programme has no finish to recover against', () => {
    expect(at({ currentFinish: null }).unknownReason).toMatch(/no current finish date/);
    expect(at({ currentFinish: 'soon' }).unknownReason).toMatch(/no current finish date/);
  });

  it('says nothing when the proposal produced no finish', () => {
    expect(at({ proposedFinish: null }).unknownReason).toMatch(/produced no finish date/);
  });

  it('refuses to state a recovery for a proposal that is not established', () => {
    // It may still be accepted — governed, not blocked — but the days it claims to recover are not
    // a figure to put in front of anybody while something is in conflict or unjudged.
    const output = at({ established: false });
    expect(output).toMatchObject({ verdict: 'UNKNOWN', workingDaysRecovered: null });
    expect(output.unknownReason).toMatch(/not established/);
  });

  it('keeps every fact it does know beside the reason it cannot answer', () => {
    const output = at({ established: false, sourceDelayId: 'delay-1', sourceAssessmentImpactDays: 6 });
    expect(output).toMatchObject({
      currentFinish: '2026-03-20', proposedFinish: '2026-03-17', sourceDelayId: 'delay-1', sourceAssessmentImpactDays: 6,
    });
  });
});
