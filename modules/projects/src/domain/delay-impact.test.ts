import { describe, expect, it } from 'vitest';
import { assessDelayImpact, type DelayImpactInput } from './delay-impact';

/**
 * The distinction this file exists for: a contractor claims the days the event lasted, an employer
 * grants the days the completion date moved, and they are usually different numbers. Float is what
 * separates them, and a system reporting only one of them has taken a side.
 */

// A → B → C, two working days each, no weekends unless a test says otherwise.
const chain = (): DelayImpactInput['tasks'] => [
  { id: 'a', name: 'Containment', durationWorkingDays: 2 },
  { id: 'b', name: 'Cabling', durationWorkingDays: 2 },
  { id: 'c', name: 'Termination', durationWorkingDays: 2 },
];
const chainEdges = [
  { predecessorTaskId: 'a', successorTaskId: 'b' },
  { predecessorTaskId: 'b', successorTaskId: 'c' },
];

const at = (over: Partial<DelayImpactInput> = {}) => assessDelayImpact({
  delay: { id: 'd1', claimedDays: 3, startDate: '2026-03-09', endDate: '2026-03-11', affectedTaskIds: ['a'] },
  tasks: chain(), dependencies: chainEdges, projectStart: '2026-03-09', otherDelays: [], ...over,
});

describe('what the delay did to the completion date', () => {
  it('moves completion by the full claim when the activity drives it', () => {
    // A is on the critical path with nothing to absorb the delay: three days claimed, three lost.
    const impact = at();
    expect(impact).toMatchObject({ claimedDays: 3, impactWorkingDays: 3, verdict: 'IMPACT', onCriticalPath: true });
    expect(impact.completionAsPlanned).toBe('2026-03-14');
    expect(impact.completionWithDelay).toBe('2026-03-17');
  });

  it('separates what was CLAIMED from what was LOST when there is float to absorb it', () => {
    // The whole point. A parallel activity with six days of slack takes a three-day hit and the
    // project finishes on the day it always would have: claimed 3, impact 0.
    const parallel: DelayImpactInput['tasks'] = [
      ...chain(),
      { id: 'spare', name: 'Signage', durationWorkingDays: 1 },
    ];
    const impact = at({ tasks: parallel, delay: { id: 'd1', claimedDays: 3, startDate: '2026-03-09', endDate: '2026-03-11', affectedTaskIds: ['spare'] } });
    expect(impact).toMatchObject({ claimedDays: 3, impactWorkingDays: 0, verdict: 'ABSORBED_BY_FLOAT', onCriticalPath: false });
    // Absorbed is a real verdict, not a failure to reach one: the delay happened and the date held.
    expect(impact.completionAsPlanned).toBe(impact.completionWithDelay);
    expect(impact.unknownReason).toBeNull();
  });

  it('moves completion by only the part float could not absorb', () => {
    // Four working days of slack, a six-day delay: two days lost, not six.
    const parallel: DelayImpactInput['tasks'] = [...chain(), { id: 'spare', name: 'Signage', durationWorkingDays: 2 }];
    const impact = at({
      tasks: parallel,
      delay: { id: 'd1', claimedDays: 6, startDate: '2026-03-09', endDate: '2026-03-16', affectedTaskIds: ['spare'] },
    });
    expect(impact).toMatchObject({ claimedDays: 6, impactWorkingDays: 2, verdict: 'IMPACT' });
  });

  it('counts the movement in WORKING days, stepping over the days nobody works', () => {
    // Fri 13th and Sat 14th are not worked, so a delay pushing through them costs the project
    // working days rather than calendar days — which is the figure a contract is written in.
    const weekends = ['2026-03-13', '2026-03-14', '2026-03-20', '2026-03-21'];
    const impact = at({ nonWorkingDays: weekends });
    expect(impact.impactWorkingDays).toBe(3);
    // …and the dates it moved between are real calendar dates that skip the weekend.
    expect(impact.completionAsPlanned).toBe('2026-03-16');
    expect(impact.completionWithDelay).toBe('2026-03-19');
  });

  it('names every activity the delay hit and what happens to each', () => {
    const impact = at({ delay: { id: 'd1', claimedDays: 2, startDate: '2026-03-09', endDate: '2026-03-10', affectedTaskIds: ['a', 'b'] } });
    expect(impact.affected.map((activity) => activity.name)).toEqual(['Containment', 'Cabling']);
    expect(impact.affected[0]).toMatchObject({ finishesAsPlanned: '2026-03-10', finishesWithDelay: '2026-03-12' });
  });
});

describe('concurrency', () => {
  const other = { id: 'd2', title: 'Late material', causeCategory: 'contractor', startDate: '2026-03-10', endDate: '2026-03-12' };

  it('names an overlapping delay and its cause, and apportions nothing', () => {
    const impact = at({ otherDelays: [other] });
    expect(impact.concurrent).toEqual([other]);
    // The figure is untouched by it. Whether a contractor-caused delay running alongside an
    // employer-caused one reduces liability is a question of contract and law, decided by people —
    // inventing that position inside arithmetic would hide it.
    expect(impact.impactWorkingDays).toBe(3);
  });

  it('leaves out a delay that does not overlap, and never names the event itself', () => {
    const apart = { ...other, id: 'd3', startDate: '2026-05-01', endDate: '2026-05-03' };
    expect(at({ otherDelays: [apart] }).concurrent).toEqual([]);
    expect(at({ otherDelays: [{ ...other, id: 'd1' }] }).concurrent).toEqual([]);
  });

  it('treats an open-ended delay as still running', () => {
    // No end date means it has not finished, not that it lasted a day.
    const running = { ...other, id: 'd4', startDate: '2026-03-01', endDate: null };
    expect(at({ otherDelays: [running] }).concurrent).toHaveLength(1);
  });
});

describe('what it refuses to put a number on', () => {
  it('says nothing about a delay naming an activity the programme no longer holds', () => {
    // Not an instruction to invent one — and a claim resting on an activity nobody can find is
    // exactly the claim that should stop rather than produce a confident figure.
    const impact = at({ delay: { id: 'd1', claimedDays: 3, startDate: '2026-03-09', endDate: '2026-03-11', affectedTaskIds: ['gone'] } });
    expect(impact.verdict).toBe('UNKNOWN');
    expect(impact.unknownReason).toMatch(/names no activity that is still in the programme/);
  });

  it('says nothing about a delay with no duration recorded', () => {
    const impact = at({ delay: { id: 'd1', claimedDays: 0, startDate: '2026-03-09', endDate: null, affectedTaskIds: ['a'] } });
    expect(impact.verdict).toBe('UNKNOWN');
    expect(impact.unknownReason).toMatch(/records no duration/);
  });

  it('says nothing when the programme itself cannot be placed', () => {
    // An activity with no authored duration cannot be placed, and the planner refuses rather than
    // substituting one. A completion date derived from a plan that could not be built is not a
    // figure anybody should put in a claim.
    const unplaceable: DelayImpactInput['tasks'] = [{ id: 'a', name: 'Containment', durationWorkingDays: null }];
    const impact = at({ tasks: unplaceable, dependencies: [] });
    expect(impact.verdict).toBe('UNKNOWN');
    expect(impact.unknownReason).toMatch(/cannot be placed/);
  });

  it('keeps every fact it does know beside the reason it cannot answer', () => {
    const impact = at({
      delay: { id: 'd1', claimedDays: 3, startDate: '2026-03-09', endDate: '2026-03-11', affectedTaskIds: ['gone'] },
      otherDelays: [{ id: 'd2', title: 'Late material', causeCategory: 'contractor', startDate: '2026-03-10', endDate: '2026-03-12' }],
    });
    expect(impact.claimedDays).toBe(3);
    expect(impact.concurrent).toHaveLength(1);
  });
});
