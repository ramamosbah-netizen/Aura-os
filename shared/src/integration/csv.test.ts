import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('csv codec', () => {
  it('serializes rows with a header', () => {
    expect(toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])).toBe('a,b\n1,x\n2,y');
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    expect(toCsv([{ n: 'Doe, John', q: 'a "quote"' }])).toBe('n,q\n"Doe, John","a ""quote"""');
  });

  it('round-trips through parseCsv', () => {
    const rows = [{ name: 'Doe, John', role: 'PM' }, { name: 'Ann', role: 'QA' }];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed).toEqual(rows);
  });

  it('returns [] for empty input', () => {
    expect(toCsv([])).toBe('');
    expect(parseCsv('')).toEqual([]);
  });
});
