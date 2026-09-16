import { describe, it, expect } from 'vitest';
import { mayReturnFromProject } from './material-return';
import { computeWac } from './stock';

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

/**
 * WHAT A RETURNED QUANTITY IS WORTH.
 *
 * Found by running the operational sequence on screen — receipt, issue, return — which `BUY-06`'s
 * frozen acceptance sentence never asked for. A return carries no price, and `computeWac` reads a
 * missing cost as 0, so material came back valued at nothing: the running average fell and inventory
 * value disappeared while ON-HAND STAYED CORRECT, which is why it was silent.
 *
 * The decision recorded here is that a return re-enters at the item's own running average, making a
 * straight issue-and-return value-neutral. These assert the arithmetic that decision implies.
 */
describe('material returned from a project keeps its value', () => {
  it('leaves the average untouched, so nothing is created or destroyed by a round trip', () => {
    // 100 m received at 6.00.
    let qty = 0;
    let avg = computeWac(qty, 0, 'in', 100, 6);
    qty += 100;
    expect(avg).toBe(6);

    // 40 m issued to the job — an issue never changes the average.
    avg = computeWac(qty, avg, 'out', 40, 0);
    qty -= 40;
    expect(qty).toBe(60);
    expect(avg).toBe(6);

    // 15 m returned, priced at the item's own running average by the service.
    avg = computeWac(qty, avg, 'in', 15, avg);
    qty += 15;
    expect(qty).toBe(75);
    expect(avg).toBe(6);
    // 75 × 6.00 — the 450 the defect turned into 360.
    expect(qty * avg).toBe(450);
  });

  it('would have caught the defect: a return valued at zero drags the average down', () => {
    // The behaviour before the fix, asserted so it cannot come back unnoticed.
    const dragged = computeWac(60, 6, 'in', 15, 0);
    expect(dragged).toBe(4.8);
    expect(60 * 6).toBe(360);
    expect(75 * dragged).toBe(360); // value destroyed: 90 gone, on-hand still right
  });

  it('returns at zero when the item genuinely has no cost, which is not a loss', () => {
    expect(computeWac(60, 0, 'in', 15, 0)).toBe(0);
  });
});
