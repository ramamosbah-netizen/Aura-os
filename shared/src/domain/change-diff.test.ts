import { describe, it, expect } from 'vitest';
import { diffFields } from './change-diff';

describe('diffFields — audit before→after (P1-2)', () => {
  it('records only changed fields as { from, to }', () => {
    const before = { total: 80000, subtotal: 76190, terms: 'Net 30' };
    const after = { total: 95000, subtotal: 90476, terms: 'Net 30' };
    expect(diffFields(before, after, ['total', 'subtotal', 'terms'])).toEqual({
      total: { from: 80000, to: 95000 },
      subtotal: { from: 76190, to: 90476 },
      // `terms` unchanged → omitted
    });
  });

  it('normalises null/undefined and diffs arrays/objects by content', () => {
    const before = { exclusions: ['VAT'], note: undefined as string | undefined };
    const after = { exclusions: ['VAT', 'Permits'], note: 'added' };
    expect(diffFields(before, after, ['exclusions', 'note'])).toEqual({
      exclusions: { from: ['VAT'], to: ['VAT', 'Permits'] },
      note: { from: null, to: 'added' },
    });
  });

  it('returns {} when nothing in the tracked field set changed', () => {
    const rec = { a: 1, b: [1, 2], c: null };
    expect(diffFields(rec, { ...rec, a: 1 }, ['a', 'b', 'c'])).toEqual({});
  });
});
