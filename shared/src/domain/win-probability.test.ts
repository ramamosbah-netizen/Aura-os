import { describe, it, expect } from 'vitest';
import { assertWinProbability, makeOpportunity, DEFAULT_WIN_PROBABILITY, WIN_PROBABILITY_MIN, WIN_PROBABILITY_MAX } from './crm';
import { resolveEffectiveWinProbability } from './deal-rules';

/**
 * Win-probability range integrity at the WRITE boundary.
 *
 * The column is NUMERIC(5,2) documented "0 to 100" by a comment and, until now, guarded by nothing:
 * 150 and -10 were representable end to end. The rule is enforced in three places (DTO, domain, DB
 * CHECK); this file owns the DOMAIN half and the boundary itself.
 *
 * The rule REJECTS. It does not clamp, and it does not fall back to the default to paper over a bad
 * value — the last test in this file is the negative control that keeps the READ side honest.
 */

const VALID = [0, 100, 20.5, 0.01, 99.99, 50];
const INVALID = [-0.01, 100.01, 150, -10, NaN, Infinity, -Infinity, 999.99];

describe('assertWinProbability — the range invariant', () => {
  it.each(VALID)('accepts %p and returns it unchanged', (v) => {
    expect(assertWinProbability(v)).toBe(v);
  });

  it.each(INVALID)('rejects %p rather than clamping it', (v) => {
    expect(() => assertWinProbability(v)).toThrow(/win probability must be a finite number between 0 and 100/i);
  });

  it('treats an omitted value as "not supplied" and applies the default', () => {
    expect(assertWinProbability(undefined)).toBe(DEFAULT_WIN_PROBABILITY);
    expect(assertWinProbability(null)).toBe(DEFAULT_WIN_PROBABILITY);
    expect(DEFAULT_WIN_PROBABILITY).toBe(20);
  });

  it('rejects a non-number rather than silently defaulting it', () => {
    // The OLD behaviour: Number.isFinite('50') is false, so a client that sent the string "50" was
    // silently stored as 20 — a number it never sent. That is the bug this guard closes.
    expect(() => assertWinProbability('50')).toThrow(/must be a finite number/i);
    expect(() => assertWinProbability({})).toThrow(/must be a finite number/i);
    expect(() => assertWinProbability(true)).toThrow(/must be a finite number/i);
  });

  it('names the received value in the message so the bad input is identifiable', () => {
    expect(() => assertWinProbability(150)).toThrow(/received 150/);
  });

  it('exposes the bounds it enforces', () => {
    expect([WIN_PROBABILITY_MIN, WIN_PROBABILITY_MAX]).toEqual([0, 100]);
  });

  // The 400-VALIDATION mapping of this message is asserted against the REAL classifier in
  // apps/api/src/error-taxonomy.fitness.test.ts — `shared` must not import from `apps/api`.
});

describe('makeOpportunity — the create path inherits the invariant', () => {
  const base = { tenantId: 't1', title: 'CCTV upgrade' };

  it.each(VALID)('stores a valid %p', (v) => {
    expect(makeOpportunity({ ...base, winProbability: v }).winProbability).toBe(v);
  });

  it.each(INVALID)('refuses to create an opportunity with %p', (v) => {
    expect(() => makeOpportunity({ ...base, winProbability: v })).toThrow(/win probability must be/i);
  });

  it('defaults to 20 only when the field is omitted', () => {
    expect(makeOpportunity(base).winProbability).toBe(20);
  });
});

describe('NEGATIVE CONTROL — the read side is deliberately unchanged', () => {
  /**
   * If this test ever starts failing because the resolver "fixed" the number, the write-boundary
   * work above has been undone in the wrong place. An out-of-range value that somehow reaches
   * storage must stay VISIBLE, not be quietly corrected into a plausible one.
   */
  it('resolveEffectiveWinProbability still passes 150 through unclamped', () => {
    expect(resolveEffectiveWinProbability({ outcome: { won: false, state: 'OPEN' }, storedProbability: 150 }))
      .toEqual({ value: 150, basis: 'STORED_PROBABILITY' });
  });

  it('still passes a negative stored value through unclamped', () => {
    expect(resolveEffectiveWinProbability({ outcome: { won: false, state: 'OPEN' }, storedProbability: -10 }).value).toBe(-10);
  });

  it('still reports certainty for closed outcomes without rewriting the stored number', () => {
    expect(resolveEffectiveWinProbability({ outcome: { won: true, state: 'GOVERNED_WON' }, storedProbability: 60 }))
      .toEqual({ value: 100, basis: 'WON_OUTCOME' });
    expect(resolveEffectiveWinProbability({ outcome: { won: false, state: 'LOST' }, storedProbability: 60 }))
      .toEqual({ value: 0, basis: 'LOST_OUTCOME' });
  });
});
