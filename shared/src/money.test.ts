import { describe, it, expect } from 'vitest';
import { roundMoney, mulMoney, addMoney, subMoney, sumMoney, vatOf, convertMoney, moneyNumber } from './money';

describe('money — rounding policy', () => {
  it('rounds half-up, away from zero on a tie', () => {
    expect(roundMoney('1.005')).toBe('1.01'); // the classic idiom failure: Math.round(1.005*100)/100 = 1.00
    expect(roundMoney('2.675')).toBe('2.68');
    expect(roundMoney('0.615')).toBe('0.62');
    expect(roundMoney('-1.005')).toBe('-1.01'); // away from zero for negatives too
    expect(roundMoney('2.674')).toBe('2.67');
    expect(roundMoney(5)).toBe('5.00'); // fixed scale
  });

  it('parses a JS number by its decimal intent, not its binary form', () => {
    expect(roundMoney(0.1 + 0.2, 2)).toBe('0.30'); // 0.30000000000000004 rounds to 0.30
    expect(mulMoney(0.7, 0.05, 2)).toBe('0.04'); // the drift case, from raw numbers
  });
});

describe('money — VAT, the drift that G-10 proved', () => {
  // The exact prices the investigation flagged as wrong under the old `round2` idiom.
  it('computes the correct VAT cent on the known-bad prices', () => {
    expect(vatOf('0.70', '5')).toBe('0.04'); // old code: 0.03
    expect(vatOf('2.90', '5')).toBe('0.15'); // old code: 0.14
    expect(vatOf('20.70', '5')).toBe('1.04'); // old code: 1.03
    expect(vatOf('42.30', '5')).toBe('2.12'); // old code: 2.11
    expect(vatOf('80.30', '5')).toBe('4.02'); // old code: 4.01
  });

  // Negative control: every VAT cent must match an exact integer-cent reference. This test FAILS
  // against the old `Math.round(price*0.05*100)/100` idiom (which drifted on 1,638 prices in the
  // 0.01..20000 scan). Because the util is exact decimal, VAT-per-cent = round(cents/20) is periodic
  // in `cents mod 20`, so scanning 0.01..2000.00 covers every residue class 100× — exhaustive.
  it('matches an exact-cent reference across the price range (zero drift)', () => {
    const exactVatCents = (cents: number): number => Math.round((cents * 5) / 100); // price cents → VAT cents, half-up
    let mismatches = 0;
    for (let cents = 1; cents <= 200_000; cents++) {
      const price = (cents / 100).toFixed(2);
      const got = Math.round(Number(vatOf(price, '5')) * 100); // our VAT, in cents
      if (got !== exactVatCents(cents)) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});

describe('money — exact arithmetic & invariants', () => {
  it('adds/subtracts without float error', () => {
    expect(addMoney('0.1', '0.2')).toBe('0.30');
    expect(subMoney('0.30', '0.10')).toBe('0.20');
    expect(sumMoney(['0.1', '0.2', '0.3', '0.4'])).toBe('1.00');
  });

  it('sums many lines exactly (rounds once, not per element)', () => {
    const lines = Array.from({ length: 1000 }, () => '0.01');
    expect(sumMoney(lines)).toBe('10.00');
  });

  it('holds subtotal + vatTotal === total for a multi-line invoice', () => {
    const nets = ['0.70', '2.90', '20.70', '80.30'];
    const subtotal = sumMoney(nets);
    const vatTotal = sumMoney(nets.map((n) => vatOf(n, '5')));
    const total = addMoney(subtotal, vatTotal);
    expect(subtotal).toBe('104.60');
    expect(vatTotal).toBe('5.25'); // 0.04 + 0.15 + 1.04 + 4.02
    expect(total).toBe('109.85');
    expect(addMoney(subtotal, vatTotal)).toBe(total);
  });

  it('converts by an FX rate exactly', () => {
    expect(convertMoney('109.85', '3.6725')).toBe('403.42'); // 109.85 * 3.6725 = 403.415…  → 403.42
    expect(convertMoney('100.00', '1')).toBe('100.00');
  });

  it('moneyNumber returns the correct numeric value', () => {
    expect(moneyNumber('0.70', 2)).toBe(0.7);
    expect(moneyNumber(vatOf('0.70', '5'))).toBe(0.04);
  });
});
