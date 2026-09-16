import { describe, it, expect } from 'vitest';
import { mayReturnFromProject } from './material-return';

/**
 * `BUY-06` — you cannot return more than you took.
 *
 * The damage this prevents was measured against the running system before the rule was written:
 * issue 20, return 50, and the BOQ item's position read `issued: −30`, `onSite: 30` and
 * `wastage: −30`. Nothing refused it, and progress, wastage and remaining-to-order all read from
 * that position.
 */

describe('a return is bounded by what is actually out there', () => {
  it('allows returning part of what was issued', () => {
    expect(mayReturnFromProject(20, 5)).toEqual({ allowed: true });
  });

  it('allows returning ALL of what was issued', () => {
    expect(mayReturnFromProject(20, 20)).toEqual({ allowed: true });
  });

  it('REFUSES returning more than was issued, and says how much is actually out', () => {
    const verdict = mayReturnFromProject(20, 50);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/only 20 of this material is currently issued/);
    expect(verdict.reason).toMatch(/cannot return more than you took/);
  });

  it('refuses a return when nothing is out there at all', () => {
    const verdict = mayReturnFromProject(0, 1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/nothing of this material is currently issued/);
  });

  it('refuses a return against an already-negative position rather than deepening it', () => {
    // A position that is already wrong is not a licence to make it worse.
    expect(mayReturnFromProject(-30, 1).allowed).toBe(false);
  });

  it('REFUSES rather than passes when the position cannot be read', () => {
    // This is the one direction where being wrong corrupts the position silently, so an
    // unreadable balance is a refusal: optional dependency, never optional evidence.
    const verdict = mayReturnFromProject(null, 1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/cannot verify how much of this material is currently issued/);
    expect(verdict.reason).toMatch(/balance nobody could read/);
  });

  it('measures the return against the net, not against the gross issued', () => {
    // 20 issued and 5 already returned leaves 15 out. Returning 16 is returning material that is
    // no longer there.
    expect(mayReturnFromProject(15, 15)).toEqual({ allowed: true });
    expect(mayReturnFromProject(15, 16).allowed).toBe(false);
  });
});
