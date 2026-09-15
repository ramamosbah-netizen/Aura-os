import { describe, expect, it } from 'vitest';
import { resolveLookAhead, type LookAheadInput } from './look-ahead';
import { workingCalendarOf } from './working-calendar';

/**
 * The readiness rule is the whole value here, and the edge that matters is the activity that looks
 * fine and is not. READY has to be ESTABLISHED: "we could not find a problem" and "there is no
 * problem" are different statements, and a look-ahead that rounds the first to the second sends a
 * crew to a site that is not open.
 */

const task = (over: Partial<LookAheadInput['tasks'][number]> = {}): LookAheadInput['tasks'][number] => ({
  id: 't1', name: 'Install containment', wbsNodeId: 'wbs-1',
  plannedStart: '2026-03-09', plannedEnd: '2026-03-13', percentComplete: 0,
  requirements: [], ...over,
});

const at = (over: Partial<LookAheadInput> = {}): ReturnType<typeof resolveLookAhead> => resolveLookAhead({
  today: '2026-03-09', weeks: 3, tasks: [task()], dependencies: [],
  commitments: new Map(), packages: new Map(), ...over,
});

const crew = (id = 'r1') => ({ id, resource: { resourceType: 'pool', canonicalResourceId: 'crew-a' }, quantity: 1, unit: 'crews' });

describe('the window itself', () => {
  it('runs from today for the weeks asked, both ends counted', () => {
    expect(at()).toMatchObject({ from: '2026-03-09', to: '2026-03-29', weeks: 3, workingDays: 21 });
  });

  it('counts its own working days under the project calendar', () => {
    const weekends = workingCalendarOf(['2026-03-13', '2026-03-14', '2026-03-20', '2026-03-21', '2026-03-27', '2026-03-28']);
    expect(at({ calendar: weekends }).workingDays).toBe(15);
  });

  it('keeps the asked-for length inside a sane range rather than trusting it', () => {
    expect(at({ weeks: 0 }).weeks).toBe(1);
    expect(at({ weeks: 99 }).weeks).toBe(12);
    expect(at({ weeks: Number.NaN }).weeks).toBe(3);
  });
});

describe('which activities are in it', () => {
  const inside = task({ id: 'inside', name: 'Inside', plannedStart: '2026-03-16', plannedEnd: '2026-03-18' });
  const before = task({ id: 'before', name: 'Before', plannedStart: '2026-02-01', plannedEnd: '2026-02-20' });
  const after = task({ id: 'after', name: 'After', plannedStart: '2026-05-01', plannedEnd: '2026-05-10' });
  const spanning = task({ id: 'spanning', name: 'Spanning', plannedStart: '2026-02-01', plannedEnd: '2026-06-01' });

  it('takes everything that overlaps the window and nothing that does not', () => {
    const lookAhead = at({ tasks: [inside, before, after, spanning] });
    expect(lookAhead.activities.map((activity) => activity.taskId)).toEqual(['spanning', 'inside']);
  });

  it('counts only the part of an activity that falls inside the window', () => {
    // Four months of work is not four months of work in the next three weeks.
    const lookAhead = at({ tasks: [spanning] });
    expect(lookAhead.activities[0].workingDaysInWindow).toBe(21);
  });

  it('separates new work from work carried in from before the window', () => {
    const lookAhead = at({ tasks: [inside, spanning] });
    expect(lookAhead.activities.find((a) => a.taskId === 'inside')!.startsInWindow).toBe(true);
    expect(lookAhead.activities.find((a) => a.taskId === 'spanning')!.startsInWindow).toBe(false);
  });
});

describe('whether an activity is ready', () => {
  it('is READY only when every fact needed to say so is known', () => {
    const lookAhead = at({
      tasks: [task({ requirements: [crew()] })],
      commitments: new Map([['r1', { feasibility: 'AVAILABLE' as const }]]),
    });
    expect(lookAhead.activities[0]).toMatchObject({ readiness: 'READY', reasons: [] });
  });

  it('is not ready while a resource it needs is uncommitted', () => {
    const lookAhead = at({ tasks: [task({ requirements: [crew()] })] });
    expect(lookAhead.activities[0].readiness).toBe('NOT_READY');
    expect(lookAhead.activities[0].reasons[0]).toMatch(/needed and not committed/);
    expect(lookAhead.activities[0].requirements[0]).toMatchObject({ committed: false, feasibility: null });
  });

  it('is not ready while a commitment it holds is over-committed', () => {
    const lookAhead = at({
      tasks: [task({ requirements: [crew()] })],
      commitments: new Map([['r1', { feasibility: 'CONFLICTED' as const }]]),
    });
    expect(lookAhead.activities[0].readiness).toBe('NOT_READY');
    expect(lookAhead.activities[0].reasons[0]).toMatch(/over-committed/);
  });

  it('is UNKNOWN — not ready — when nobody declared the capacity', () => {
    // The trap this rule exists for. Nothing is WRONG; nothing is known either, and reporting that
    // as ready sends a crew to a site nobody confirmed is open.
    const lookAhead = at({
      tasks: [task({ requirements: [crew()] })],
      commitments: new Map([['r1', { feasibility: 'UNKNOWN' as const }]]),
    });
    expect(lookAhead.activities[0].readiness).toBe('UNKNOWN');
    expect(lookAhead.activities[0].reasons[0]).toMatch(/nobody has declared capacity/);
  });

  it('calls it NOT_READY when an unknown sits beside a real problem', () => {
    // An unknown does not soften a known refusal: one resource is missing outright.
    const lookAhead = at({
      tasks: [task({ requirements: [crew('r1'), crew('r2')] })],
      commitments: new Map([['r1', { feasibility: 'UNKNOWN' as const }]]),
    });
    expect(lookAhead.activities[0].readiness).toBe('NOT_READY');
    expect(lookAhead.activities[0].reasons).toHaveLength(2);
  });

  it('is not ready while a predecessor has not cleared in time, and names it', () => {
    const predecessor = task({ id: 'p1', name: 'Pull cable', plannedStart: '2026-03-09', plannedEnd: '2026-03-20' });
    const successor = task({ id: 't1', name: 'Terminate', plannedStart: '2026-03-16', plannedEnd: '2026-03-18' });
    const lookAhead = at({
      tasks: [predecessor, successor],
      dependencies: [{ predecessorTaskId: 'p1', successorTaskId: 't1' }],
    });
    const terminate = lookAhead.activities.find((activity) => activity.taskId === 't1')!;
    expect(terminate.readiness).toBe('NOT_READY');
    expect(terminate.reasons[0]).toMatch(/waits for “Pull cable”, which is not planned to finish until 2026-03-20/);
    expect(terminate.waitsFor[0]).toMatchObject({ taskId: 'p1', clearsInTime: false });
  });

  it('is ready once the predecessor finishes before it starts', () => {
    const predecessor = task({ id: 'p1', name: 'Pull cable', plannedStart: '2026-03-09', plannedEnd: '2026-03-13' });
    const successor = task({ id: 't1', name: 'Terminate', plannedStart: '2026-03-16', plannedEnd: '2026-03-18' });
    const lookAhead = at({
      tasks: [predecessor, successor],
      dependencies: [{ predecessorTaskId: 'p1', successorTaskId: 't1' }],
    });
    expect(lookAhead.activities.find((activity) => activity.taskId === 't1')!.readiness).toBe('READY');
  });

  it('ignores a dependency naming an activity that is not in this plan', () => {
    // Not a reason to invent one, and not a reason to refuse to answer about the rest.
    const lookAhead = at({ dependencies: [{ predecessorTaskId: 'ghost', successorTaskId: 't1' }] });
    expect(lookAhead.activities[0]).toMatchObject({ readiness: 'READY', waitsFor: [] });
  });
});

describe('the quantities it reports', () => {
  it('gives a work package ONE row however many activities deliver it', () => {
    // The apportionment trap. Two activities on one package each read that package's whole sold
    // quantity, because no apportionment has ever been authored — summing them would report 400 m²
    // sold where 200 was.
    const lookAhead = at({
      tasks: [
        task({ id: 'a', name: 'First fix', wbsNodeId: 'wbs-1' }),
        task({ id: 'b', name: 'Second fix', wbsNodeId: 'wbs-1' }),
      ],
      packages: new Map([['wbs-1', { plannedQuantity: 200, installedQuantity: 60, unit: 'm2' }]]),
    });
    expect(lookAhead.packages).toHaveLength(1);
    expect(lookAhead.packages[0]).toMatchObject({ wbsNodeId: 'wbs-1', plannedQuantity: 200, installedQuantity: 60, activityIds: ['a', 'b'] });
  });

  it('reports a package nobody has measured as unmeasured rather than as zero', () => {
    const lookAhead = at({ packages: new Map([['wbs-1', { plannedQuantity: 200, installedQuantity: null, unit: 'm2' }]]) });
    expect(lookAhead.packages[0]).toMatchObject({ plannedQuantity: 200, installedQuantity: null });
  });

  it('leaves an activity with no work package out of the quantities entirely', () => {
    const lookAhead = at({ tasks: [task({ wbsNodeId: null })] });
    expect(lookAhead.packages).toEqual([]);
    expect(lookAhead.activities).toHaveLength(1);
  });
});
