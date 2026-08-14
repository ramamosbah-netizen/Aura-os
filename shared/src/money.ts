import Big from 'big.js';

/**
 * The single money policy for AURA (G-10).
 *
 * Money is exact decimal — never binary float. Before this module, every domain rolled its own
 * `round2 = (n) => Math.round(n * 100) / 100` (duplicated across ~37 files) and did arithmetic on
 * JS `number`. Two float faults compounded:
 *   1. the multiply was already inexact — `0.70 * 0.05 = 0.03499999999999…`, not `0.035`;
 *   2. the idiom mis-rounds at the boundary — `Math.round(1.005 * 100) / 100 = 1.00`, not `1.01`.
 * The observable result was 1,638 wrong VAT cents across ordinary AED prices (e.g. 0.70 → 0.03).
 *
 * Everything here computes with big.js (arbitrary-precision decimal) and rounds through ONE policy:
 * half-up, away from zero on a tie (the UAE FTA convention, symmetric for negatives). Values are
 * returned as fixed-scale decimal strings — the exact form the DB's `numeric` columns already hold.
 */

export type MoneyInput = string | number | Big;

/** Round half-up; on a .5 tie, away from zero. `Big.roundHalfUp` === 1. */
const HALF_UP = Big.roundHalfUp;

/**
 * Parse to an exact Big. A JS number is stringified first (shortest round-trip), so `0.1` becomes
 * exactly `0.1`, never the binary `0.1000000000000000055…`.
 *
 * Caveat: a number that is ALREADY the product of float arithmetic carries its error in
 * (`0.1 + 0.2` stringifies to `"0.30000000000000004"`). The durable fix is to keep money as a
 * string end to end — that is Phase 2 (the read boundary + SDK). Here, callers pass raw inputs.
 */
export function toBig(x: MoneyInput): Big {
  if (x instanceof Big) return x;
  return new Big(typeof x === 'number' ? String(x) : x.trim());
}

/** Round to `dp` places, half-up, as a fixed-scale decimal string (e.g. "0.04", "5.00"). */
export function roundMoney(x: MoneyInput, dp = 2): string {
  return toBig(x).round(dp, HALF_UP).toFixed(dp);
}

/** Exact a × b, rounded to `dp`. */
export function mulMoney(a: MoneyInput, b: MoneyInput, dp = 2): string {
  return roundMoney(toBig(a).times(toBig(b)), dp);
}

/** Exact a + b, rounded to `dp`. */
export function addMoney(a: MoneyInput, b: MoneyInput, dp = 2): string {
  return roundMoney(toBig(a).plus(toBig(b)), dp);
}

/** Exact a − b, rounded to `dp`. */
export function subMoney(a: MoneyInput, b: MoneyInput, dp = 2): string {
  return roundMoney(toBig(a).minus(toBig(b)), dp);
}

/** Exact sum of many values, rounded ONCE at the end (not per element). */
export function sumMoney(xs: readonly MoneyInput[], dp = 2): string {
  return roundMoney(
    xs.reduce<Big>((acc, x) => acc.plus(toBig(x)), new Big(0)),
    dp,
  );
}

/** VAT on a net amount: net × ratePct ÷ 100, rounded to `dp`. */
export function vatOf(net: MoneyInput, ratePct: MoneyInput, dp = 2): string {
  return roundMoney(toBig(net).times(toBig(ratePct)).div(100), dp);
}

/** Convert to another currency: amount × fxRate, rounded to `dp`. */
export function convertMoney(amount: MoneyInput, fxRate: MoneyInput, dp = 2): string {
  return roundMoney(toBig(amount).times(toBig(fxRate)), dp);
}

/**
 * Numeric form of a rounded money value, for the legacy `number`-typed domain fields that Phase 1
 * keeps. The VALUE is correct (computed exactly, then rounded); only its outward type is `number`.
 * `Number("0.04") === 0.04` exactly for money magnitudes at ≤ 2dp.
 */
export function moneyNumber(x: MoneyInput, dp = 2): number {
  return Number(roundMoney(x, dp));
}

/**
 * Exact half-up rounding for NON-money decimals — hours, days, percentages — that still suffer the
 * same `Math.round(n*100)/100` boundary bug. Same engine as `moneyNumber`, named to keep intent
 * honest where the value is not currency.
 */
export function roundDecimal(x: MoneyInput, dp = 2): number {
  return Number(roundMoney(x, dp));
}
