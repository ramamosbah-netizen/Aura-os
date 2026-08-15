import { describe, it, expect } from 'vitest';
import {
  applySearch, applyFilters, applySort, paginate, pageCountOf, clampPage,
  serializeQuery, parseQuery, type TableQueryState,
} from './table-query';

interface Row extends Record<string, unknown> {
  id: string;
  code: string;
  status: string;
  owner: string | null;
  due: number;
}

const rows: Row[] = [
  { id: '1', code: 'NCR-003', status: 'open', owner: 'Ahmed', due: 3 },
  { id: '2', code: 'NCR-001', status: 'closed', owner: 'Ali', due: 1 },
  { id: '3', code: 'NCR-002', status: 'open', owner: null, due: 2 },
  { id: '4', code: 'NCR-004', status: 'corrected', owner: 'Sara', due: 4 },
];

describe('applySearch', () => {
  it('returns all rows for empty/whitespace query', () => {
    expect(applySearch(rows, '')).toHaveLength(4);
    expect(applySearch(rows, '   ')).toHaveLength(4);
  });
  it('matches case-insensitively across all fields by default', () => {
    expect(applySearch(rows, 'ahmed').map((r) => r.id)).toEqual(['1']);
    expect(applySearch(rows, 'OPEN').map((r) => r.id)).toEqual(['1', '3']);
  });
  it('scopes to searchFields when provided', () => {
    // 'ali' appears in owner 'Ali'; restricting to code must find nothing
    expect(applySearch(rows, 'ali', ['code'])).toHaveLength(0);
    expect(applySearch(rows, 'ali', ['owner']).map((r) => r.id)).toEqual(['2']);
  });
  it('ignores null/undefined values safely', () => {
    expect(() => applySearch(rows, 'x', ['owner'])).not.toThrow();
  });
});

describe('applyFilters', () => {
  it('returns all rows when no filter values are set', () => {
    expect(applyFilters(rows, {})).toHaveLength(4);
    expect(applyFilters(rows, { status: '' })).toHaveLength(4);
  });
  it('keeps only exact matches, string-compared', () => {
    expect(applyFilters(rows, { status: 'open' }).map((r) => r.id)).toEqual(['1', '3']);
  });
  it('ANDs multiple active filters', () => {
    expect(applyFilters(rows, { status: 'open', owner: 'Ahmed' }).map((r) => r.id)).toEqual(['1']);
  });
});

describe('applySort', () => {
  it('is a no-op without a sort key (preserves order & identity)', () => {
    const out = applySort(rows, null, 'asc');
    expect(out).toBe(rows);
  });
  it('sorts ascending and descending', () => {
    expect(applySort(rows, 'due', 'asc').map((r) => r.due)).toEqual([1, 2, 3, 4]);
    expect(applySort(rows, 'due', 'desc').map((r) => r.due)).toEqual([4, 3, 2, 1]);
  });
  it('pushes null/undefined last regardless of direction', () => {
    expect(applySort(rows, 'owner', 'asc').map((r) => r.owner)).toEqual(['Ahmed', 'Ali', 'Sara', null]);
    expect(applySort(rows, 'owner', 'desc')[3].owner).toBeNull();
  });
  it('does not mutate the input array', () => {
    const copy = [...rows];
    applySort(rows, 'due', 'desc');
    expect(rows).toEqual(copy);
  });
});

describe('pagination', () => {
  it('pageCountOf rounds up and never returns 0', () => {
    expect(pageCountOf(0, 25)).toBe(1);
    expect(pageCountOf(50, 25)).toBe(2);
    expect(pageCountOf(51, 25)).toBe(3);
  });
  it('clampPage keeps page within [1, pageCount] — a filter shrinking results snaps back', () => {
    expect(clampPage(3, 1)).toBe(1); // was on page 3, filter left 1 page
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
  });
  it('paginate slices the right window', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    expect(paginate(ten, 1, 4).map((r) => r.id)).toEqual(['0', '1', '2', '3']);
    expect(paginate(ten, 3, 4).map((r) => r.id)).toEqual(['8', '9']);
  });
});

describe('URL (de)serialisation', () => {
  const state: TableQueryState = { search: 'cam', sortKey: 'due', sortDir: 'desc', page: 2, filters: { status: 'open' } };

  it('serialises only non-default values, prefixed', () => {
    const out = serializeQuery(new URLSearchParams(), 'ncr', state, ['status']);
    expect(out.get('ncr_q')).toBe('cam');
    expect(out.get('ncr_sort')).toBe('due');
    expect(out.get('ncr_dir')).toBe('desc');
    expect(out.get('ncr_page')).toBe('2');
    expect(out.get('ncr_f_status')).toBe('open');
  });
  it('omits defaults (asc dir, page 1, empty search/filter)', () => {
    const dflt: TableQueryState = { search: '', sortKey: null, sortDir: 'asc', page: 1, filters: { status: '' } };
    const out = serializeQuery(new URLSearchParams(), 'ncr', dflt, ['status']);
    expect(out.toString()).toBe('');
  });
  it('preserves unrelated params already in the URL', () => {
    const current = new URLSearchParams('tab=history&other_q=keep');
    const out = serializeQuery(current, 'ncr', state, ['status']);
    expect(out.get('tab')).toBe('history');
    expect(out.get('other_q')).toBe('keep');
  });
  it('round-trips through parseQuery', () => {
    const serialised = serializeQuery(new URLSearchParams(), 'ncr', state, ['status']);
    const parsed = parseQuery(serialised, 'ncr', ['status']);
    expect(parsed).toEqual(state);
  });
  it('parseQuery falls back to defaults for missing/garbage values', () => {
    const parsed = parseQuery(new URLSearchParams('ncr_page=abc'), 'ncr', ['status']);
    expect(parsed.page).toBe(1);
    expect(parsed.sortDir).toBe('asc');
    expect(parsed.filters.status).toBe('');
  });
});

describe('full pipeline (search → filter → sort → paginate)', () => {
  it('composes the same way the component renders', () => {
    const filtered = applyFilters(applySearch(rows, 'ncr'), { status: 'open' });
    const sorted = applySort(filtered, 'due', 'desc');
    const paged = paginate(sorted, 1, 1);
    expect(paged.map((r) => r.id)).toEqual(['1']); // NCR-003 (due 3) before NCR-002 (due 2)
    expect(pageCountOf(sorted.length, 1)).toBe(2);
  });
});
