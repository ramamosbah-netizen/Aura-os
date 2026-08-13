import { describe, it, expect } from 'vitest';
import {
  FINE_TRANSITIONS,
  canTransitionFine,
  makeTrafficFine,
  assignFine,
  disputeFine,
  resolveDispute,
  payFine,
  type NewTrafficFine,
} from './traffic-fine';

// G-08 residue (fleet). The traffic fine already had ad-hoc guards; what it did not have was a way
// OUT of `disputed`. A contested fine could never be recovered or written off, so the register
// slowly filled with fines nobody could action. These cover both exits.

const base: NewTrafficFine = {
  tenantId: 't1',
  vehicleId: 'veh-1',
  fineNumber: 'DXB-99001',
  violation: 'Speeding 20km/h over',
  amount: 600,
  blackPoints: 4,
  fineDate: '2026-07-01',
};

describe('fine state machine', () => {
  it('makes paid and cancelled terminal', () => {
    expect(FINE_TRANSITIONS.paid).toEqual([]);
    expect(FINE_TRANSITIONS.cancelled).toEqual([]);
  });

  it('gives disputed two ways out — back to pending, or cancelled', () => {
    expect(canTransitionFine('disputed', 'pending')).toBe(true);
    expect(canTransitionFine('disputed', 'cancelled')).toBe(true);
    // …but never straight to paid: settle the dispute first.
    expect(canTransitionFine('disputed', 'paid')).toBe(false);
  });
});

describe('dispute resolution', () => {
  it('rejected dispute returns the fine to pending so recovery resumes', () => {
    const assigned = assignFine(makeTrafficFine(base), 'emp-7');
    const disputed = disputeFine(assigned);
    expect(disputed.status).toBe('disputed');

    const resolved = resolveDispute(disputed, false);
    expect(resolved.status).toBe('pending');
    // The dispute was about who owed it, so the driver assignment is cleared.
    expect(resolved.driverEmployeeId).toBeNull();

    // Recovery can now proceed normally.
    const reassigned = assignFine(resolved, 'emp-9');
    expect(reassigned.status).toBe('assigned');
    expect(payFine(reassigned).status).toBe('paid');
  });

  it('upheld dispute cancels the fine — terminal, nothing to recover', () => {
    const disputed = disputeFine(makeTrafficFine(base));
    const cancelled = resolveDispute(disputed, true);
    expect(cancelled.status).toBe('cancelled');

    expect(() => payFine(cancelled)).toThrow(/can only advance/);
    expect(() => assignFine(cancelled, 'emp-1')).toThrow(/can only advance/);
  });

  it('refuses to resolve a dispute that was never raised', () => {
    const pending = makeTrafficFine(base);
    expect(() => resolveDispute(pending, true)).toThrow(/can only advance/);
  });

  it('still refuses to pay a disputed fine directly', () => {
    const disputed = disputeFine(makeTrafficFine(base));
    expect(() => payFine(disputed)).toThrow(/can only advance/);
  });

  it('allows a dispute to be raised after the fine was assigned', () => {
    const assigned = assignFine(makeTrafficFine(base), 'emp-3');
    expect(disputeFine(assigned).status).toBe('disputed');
  });
});
