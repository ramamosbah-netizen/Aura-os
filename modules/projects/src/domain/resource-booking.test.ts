import { describe, expect, it } from 'vitest';
import {
  assessBooking,
  bookingDays,
  bookingIsRefused,
  commitBooking,
  releaseBooking,
  respondToBooking,
  wasValidAtCommitment,
  type DayAvailability,
  type DayLoad,
  type NewResourceBooking,
} from './resource-booking';
import type { ResourceRef } from './resource-ref';

/**
 * §22 Step 6 — bookings.
 *
 * What these tests exist to protect is one sentence from the gate:
 *
 *   > A booking is valid AT CREATION only if capacity was available at that time. A later
 *   > availability change does not rewrite history [...] it changes the booking's CURRENT
 *   > FEASIBILITY.
 *
 * Two properties that a lesser design collapses into one field:
 *
 *   creation validity     settled once, never revised
 *   current feasibility   recomputed against today
 */

const crane: ResourceRef = { resourceType: 'asset', canonicalResourceId: 'CR-01' };
const crew: ResourceRef = { resourceType: 'pool', canonicalResourceId: 'elv-crew' };

const booking = (over: Partial<NewResourceBooking> = {}): NewResourceBooking => ({
  tenantId: 't1',
  projectId: 'p1',
  resource: crew,
  unit: 'persons',
  quantity: 4,
  from: '2026-07-06',
  to: '2026-07-08',
  ...over,
});

/** Capacity known and level across the whole range, with nothing else committed. */
const clear = (capacity: number | null, unit: DayAvailability['unit'] = 'persons'): DayAvailability[] =>
  bookingDays('2026-07-06', '2026-07-08').map((day) => ({ day, capacity, alreadyCommitted: 0, unit }));

const load = (capacity: number | null, committed: number, unit: DayLoad['unit'] = 'persons'): DayLoad[] =>
  bookingDays('2026-07-06', '2026-07-08').map((day) => ({ day, capacity, committed, unit }));

describe('the temporal invariant', () => {
  it('lets a booking that fitted become conflicted WITHOUT becoming invalid', () => {
    // The headline case. Eight electricians booked against a crew of ten; two are later granted
    // leave by HR, who neither knew nor needed to know about this project.
    const b = commitBooking(booking({ quantity: 8 }), clear(10));

    expect(wasValidAtCommitment(b)).toBe(true);

    const now = assessBooking(b, load(6, 8));
    expect(now.feasibility).toBe('CONFLICTED');
    expect(now.conflictDays).toHaveLength(3);

    // History is untouched. The booking was right when it was made and is not right now, and the
    // record still says both.
    expect(wasValidAtCommitment(b)).toBe(true);
    expect(b.capacityAtCommitment).toBe(10);
    expect(b.status).toBe('held');
  });

  it('names the temporal case, because it is resolved differently', () => {
    // "This became infeasible" and "this never fitted" call for different conversations: one is a
    // change to absorb, the other is a decision to revisit. A planner should not have to work out
    // which from the numbers.
    const wasFine = commitBooking(booking({ quantity: 8 }), clear(10));
    expect(assessBooking(wasFine, load(6, 8)).becameInfeasible).toBe(true);
    expect(assessBooking(wasFine, load(6, 8)).reason).toMatch(/fitted when it was committed/);

    const neverFitted = commitBooking(
      booking({ quantity: 12, overCapacityReason: 'overtime approved by the PM' }),
      clear(10),
    );
    const now = assessBooking(neverFitted, load(10, 12));
    expect(now.feasibility).toBe('CONFLICTED');
    expect(now.becameInfeasible).toBe(false);
    expect(now.reason).not.toMatch(/fitted when it was committed/);
  });

  it('does not store the current verdict anywhere on the record', () => {
    // A stored verdict is a verdict as of whenever somebody last remembered to recompute it, and
    // capacity changes for reasons that have nothing to do with this project.
    const b = commitBooking(booking(), clear(10));
    expect(Object.keys(b)).not.toContain('feasibility');
    expect(Object.keys(b)).not.toContain('conflicted');
  });
});

describe('the commitment snapshot is derived, not supplied', () => {
  it('records the tightest day, not an average', () => {
    // Fitting on four days and not the fifth is not fitting. An average would let a genuine
    // Tuesday clash disappear into a comfortable week.
    const b = commitBooking(booking({ quantity: 2, overCapacityReason: 'accepted' }), [
      { day: '2026-07-06', capacity: 10, alreadyCommitted: 0, unit: 'persons' },
      { day: '2026-07-07', capacity: 3, alreadyCommitted: 2, unit: 'persons' },
      { day: '2026-07-08', capacity: 10, alreadyCommitted: 0, unit: 'persons' },
    ]);
    expect(b.capacityAtCommitment).toBe(3);
    expect(b.demandAtCommitment).toBe(4);
    expect(wasValidAtCommitment(b)).toBe(false);
  });

  it('counts what others have already committed, not just this booking', () => {
    const b = commitBooking(booking({ quantity: 4 }), [
      { day: '2026-07-06', capacity: 10, alreadyCommitted: 6, unit: 'persons' },
      { day: '2026-07-07', capacity: 10, alreadyCommitted: 6, unit: 'persons' },
      { day: '2026-07-08', capacity: 10, alreadyCommitted: 6, unit: 'persons' },
    ]);
    expect(b.demandAtCommitment).toBe(10);
    expect(wasValidAtCommitment(b)).toBe(true);
  });

  it('is UNKNOWN when capacity is unknown on ANY covered day', () => {
    // Knowing four days out of five is not knowing. Rounding it up to "fits" is precisely how the
    // previous planner told two projects a booked crane was free.
    const b = commitBooking(booking(), [
      { day: '2026-07-06', capacity: 10, alreadyCommitted: 0, unit: 'persons' },
      { day: '2026-07-07', capacity: null, alreadyCommitted: 0, unit: 'persons' },
      { day: '2026-07-08', capacity: 10, alreadyCommitted: 0, unit: 'persons' },
    ]);
    expect(b.capacityAtCommitment).toBeNull();
    expect(wasValidAtCommitment(b)).toBeNull();
  });

  it('is UNKNOWN when a covered day is missing altogether', () => {
    const b = commitBooking(booking(), [
      { day: '2026-07-06', capacity: 10, alreadyCommitted: 0, unit: 'persons' },
    ]);
    expect(b.capacityAtCommitment).toBeNull();
  });

  it('is UNKNOWN when the capacity is measured in another unit', () => {
    // 4 persons against 40 hours is not a comparison, and converting between them would be an
    // invented rule the gate explicitly forbids.
    const b = commitBooking(booking({ unit: 'persons' }), clear(40, 'hours'));
    expect(b.capacityAtCommitment).toBeNull();
    expect(wasValidAtCommitment(b)).toBeNull();
  });

  it('says UNKNOWN rather than false when nobody recorded the capacity', () => {
    // Three answers, not two. Calling this invalid would blame a planner for a fact nobody wrote
    // down, and calling it valid would be the old Infinity bug wearing a new name.
    const b = commitBooking(booking(), []);
    expect(b.capacityAtCommitment).toBeNull();
    expect(b.demandAtCommitment).toBe(4);
    expect(wasValidAtCommitment(b)).toBeNull();
  });

  it('treats a declared zero as a real fact, not as unknown', () => {
    expect(() => commitBooking(booking(), clear(0))).toThrow(/requires a reason/);
    const b = commitBooking(booking({ overCapacityReason: 'crew arrives on site regardless' }), clear(0));
    expect(b.capacityAtCommitment).toBe(0);
    expect(wasValidAtCommitment(b)).toBe(false);
  });
});

describe('committing over capacity is governed, not blocked', () => {
  it('refuses a silent overrun', () => {
    expect(() => commitBooking(booking({ quantity: 12 }), clear(10)))
      .toThrow(/exceeds the capacity known for the resource/);
  });

  it('permits it with a reason, and keeps the reason', () => {
    // Blocking would not prevent the overrun; it would prevent the RECORD of it, and an
    // unrecorded commitment conflicts with nothing and warns nobody.
    const b = commitBooking(booking({ quantity: 12, overCapacityReason: '  hire agreed with Al-Faris  ' }), clear(10));
    expect(b.overCapacityReason).toBe('hire agreed with Al-Faris');
    expect(wasValidAtCommitment(b)).toBe(false);
    expect(b.status).toBe('held');
  });

  it('needs no reason when the capacity is unknown', () => {
    // Nobody can be asked to justify exceeding a number that has never been recorded. The absence
    // is captured in the snapshot instead, where it is visible and answerable later.
    const b = commitBooking(booking({ quantity: 12 }), clear(null));
    expect(b.overCapacityReason).toBeNull();
    expect(b.capacityAtCommitment).toBeNull();
  });

  it('drops a reason given for a booking that fitted', () => {
    // Left on the record it would read, later, as evidence of an overrun that never happened.
    const b = commitBooking(booking({ quantity: 2, overCapacityReason: 'not needed' }), clear(10));
    expect(b.overCapacityReason).toBeNull();
  });
});

describe('assessing a booking against today', () => {
  it('is AVAILABLE when it still fits', () => {
    const b = commitBooking(booking(), clear(10));
    expect(assessBooking(b, load(10, 4)).feasibility).toBe('AVAILABLE');
  });

  it('reports only the days that actually conflict', () => {
    const b = commitBooking(booking(), clear(10));
    const now = assessBooking(b, [
      { day: '2026-07-06', capacity: 10, committed: 4, unit: 'persons' },
      { day: '2026-07-07', capacity: 3, committed: 4, unit: 'persons' },
      { day: '2026-07-08', capacity: 10, committed: 4, unit: 'persons' },
    ]);
    expect(now.conflictDays).toEqual(['2026-07-07']);
  });

  it('reports a conflict it can see even when other days are unknown', () => {
    // Answering UNKNOWN here would hide a real clash behind a missing one.
    const b = commitBooking(booking(), clear(10));
    const now = assessBooking(b, [
      { day: '2026-07-06', capacity: null, committed: 4, unit: 'persons' },
      { day: '2026-07-07', capacity: 3, committed: 4, unit: 'persons' },
      { day: '2026-07-08', capacity: null, committed: 4, unit: 'persons' },
    ]);
    expect(now.feasibility).toBe('CONFLICTED');
    expect(now.conflictDays).toEqual(['2026-07-07']);
  });

  it('is UNKNOWN, never AVAILABLE, when capacity is not known', () => {
    const b = commitBooking(booking(), clear(10));
    const now = assessBooking(b, load(null, 4));
    expect(now.feasibility).toBe('UNKNOWN');
    expect(now.reason).toMatch(/unknown on 3 of the days/);
  });

  it('is UNKNOWN when no facts are supplied at all', () => {
    const b = commitBooking(booking(), clear(10));
    expect(assessBooking(b, []).feasibility).toBe('UNKNOWN');
  });

  it('refuses to compare across units', () => {
    const b = commitBooking(booking({ unit: 'persons' }), clear(10));
    const now = assessBooking(b, load(40, 40, 'hours'));
    expect(now.feasibility).toBe('UNKNOWN');
    expect(now.reason).toMatch(/measured in hours and this booking in persons/);
    expect(now.conflictDays).toEqual([]);
  });
});

describe('releasing', () => {
  it('holds nothing afterwards, so it conflicts with nothing', () => {
    // A released booking on a planner's conflict list is a resolved problem put back on screen.
    const b = releaseBooking(commitBooking(booking(), clear(10)), { reason: 'task moved to August' });
    expect(b.status).toBe('released');
    expect(assessBooking(b, load(1, 40)).feasibility).toBe('AVAILABLE');
  });

  it('requires a reason', () => {
    const b = commitBooking(booking(), clear(10));
    expect(() => releaseBooking(b, { reason: '   ' })).toThrow(/requires a reason/);
  });

  it('cannot be released twice', () => {
    const b = releaseBooking(commitBooking(booking(), clear(10)), { reason: 'no longer needed' });
    expect(() => releaseBooking(b, { reason: 'again' })).toThrow(/already been released/);
  });

  it('keeps the record and its commitment history', () => {
    // The capacity is given back; the fact that it was once committed is not deleted.
    const held = commitBooking(booking({ quantity: 8 }), clear(10));
    const b = releaseBooking(held, { reason: 'scope cut', actorId: 'u1' });
    expect(b.capacityAtCommitment).toBe(10);
    expect(b.demandAtCommitment).toBe(8);
    expect(b.committedAt).toBe(held.committedAt);
    expect(b.releasedBy).toBe('u1');
  });
});

describe('the allocated person\u2019s answer', () => {
  it('starts pending — a commitment about someone is not consent from them', () => {
    const b = commitBooking(booking(), clear(10));
    expect(b.response).toBe('pending');
    expect(b.responseAt).toBeNull();
    expect(bookingIsRefused(b)).toBe(false);
  });

  it('changes nothing the project committed to', () => {
    // The whole point: a refusal must not move a number the planner is accountable for.
    const held = commitBooking(booking({ quantity: 4 }), clear(10));
    const refused = respondToBooking(held, { response: 'declined', reason: 'on annual leave that week', actorId: 'u-maya' });
    expect(refused).toMatchObject({
      status: 'held', quantity: 4, unit: 'persons', from: held.from, to: held.to,
      capacityAtCommitment: 10, demandAtCommitment: 4, committedAt: held.committedAt,
    });
    expect(refused.response).toBe('declined');
    expect(refused.responseReason).toBe('on annual leave that week');
    expect(refused.responseBy).toBe('u-maya');
    expect(bookingIsRefused(refused)).toBe(true);
  });

  it('frees no capacity, so the day is still as committed as it was', () => {
    const refused = respondToBooking(commitBooking(booking(), clear(10)), { response: 'declined', reason: 'double-booked' });
    // Feasibility answers a capacity question; a refusal is a different question and must not
    // silently answer this one.
    expect(assessBooking(refused, load(10, 4)).feasibility).toBe('AVAILABLE');
    expect(assessBooking(refused, load(2, 4)).feasibility).toBe('CONFLICTED');
  });

  it('requires a reason to decline, because the planner has to act on it', () => {
    const b = commitBooking(booking(), clear(10));
    expect(() => respondToBooking(b, { response: 'declined', reason: '  ' })).toThrow(/requires a reason/);
    expect(() => respondToBooking(b, { response: 'declined' })).toThrow(/requires a reason/);
  });

  it('accepts without one, and keeps no reason beside an acceptance', () => {
    const refused = respondToBooking(commitBooking(booking(), clear(10)), { response: 'declined', reason: 'clash' });
    const accepted = respondToBooking(refused, { response: 'accepted', actorId: 'u-maya' });
    expect(accepted.response).toBe('accepted');
    // A stale objection sitting beside an acceptance would read as an overruled complaint.
    expect(accepted.responseReason).toBeNull();
  });

  it('lets a person change their mind, because circumstances do', () => {
    const accepted = respondToBooking(commitBooking(booking(), clear(10)), { response: 'accepted' });
    const later = respondToBooking(accepted, { response: 'declined', reason: 'broken wrist' });
    expect(later.response).toBe('declined');
    expect(later.responseReason).toBe('broken wrist');
  });

  it('does not re-stamp the same answer, so \u201cwhen did they accept\u201d keeps its meaning', () => {
    const accepted = respondToBooking(commitBooking(booking(), clear(10)), { response: 'accepted' });
    expect(respondToBooking(accepted, { response: 'accepted' })).toBe(accepted);
  });

  it('refuses to answer a released booking, which asks nothing of anyone', () => {
    const gone = releaseBooking(commitBooking(booking(), clear(10)), { reason: 'task cancelled' });
    expect(() => respondToBooking(gone, { response: 'accepted' })).toThrow(/already been released/);
  });
});

describe('what a booking refuses to be', () => {
  it('refuses zero', () => {
    expect(() => commitBooking(booking({ quantity: 0 }))).toThrow(/more than zero/);
    expect(() => commitBooking(booking({ quantity: -3 }))).toThrow(/more than zero/);
  });

  it('refuses a resource it cannot name', () => {
    expect(() => commitBooking(booking({ resource: { resourceType: 'crane', canonicalResourceId: 'x' } as never })))
      .toThrow(/must name a valid resource/);
    expect(() => commitBooking(booking({ resource: { resourceType: 'asset', canonicalResourceId: ' ' } })))
      .toThrow(/must name a valid resource/);
  });

  it('refuses an unknown unit rather than guessing one', () => {
    expect(() => commitBooking(booking({ unit: 'people' as never })))
      .toThrow(/hours, persons, crews or units/);
  });

  it('refuses a range that ends before it starts', () => {
    expect(() => commitBooking(booking({ from: '2026-07-08', to: '2026-07-06' })))
      .toThrow(/end on or after it starts/);
  });

  it('refuses a date that is not a date', () => {
    expect(() => commitBooking(booking({ from: '06/07/2026' }))).toThrow(/YYYY-MM-DD/);
  });

  it('holds on a single day when from and to are the same', () => {
    const b = commitBooking(booking({ from: '2026-07-06', to: '2026-07-06' }), clear(10));
    expect(bookingDays(b.from, b.to)).toEqual(['2026-07-06']);
  });
});

describe('bookingDays', () => {
  it('is inclusive at both ends', () => {
    expect(bookingDays('2026-07-06', '2026-07-08')).toEqual(['2026-07-06', '2026-07-07', '2026-07-08']);
  });

  it('crosses a month boundary without losing a day', () => {
    // The local-midnight trap: `new Date('2026-03-01')` in a positive-offset zone is
    // 2026-02-28T21:00Z, and a naive toISOString() would report the wrong day.
    expect(bookingDays('2026-02-27', '2026-03-02'))
      .toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it('crosses a leap day', () => {
    expect(bookingDays('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });
});
