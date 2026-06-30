import { describe, it, expect } from 'vitest';
import { parsePageParams, paginate, makePage, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from './pagination';

describe('pagination contract', () => {
  it('defaults and clamps params', () => {
    expect(parsePageParams()).toEqual({ limit: DEFAULT_PAGE_LIMIT, offset: 0 });
    expect(parsePageParams('20', '40')).toEqual({ limit: 20, offset: 40 });
    expect(parsePageParams('99999', '-5').limit).toBe(MAX_PAGE_LIMIT);
    expect(parsePageParams('0', 'x')).toEqual({ limit: DEFAULT_PAGE_LIMIT, offset: 0 });
  });

  it('paginates an array with correct total + hasMore', () => {
    const all = Array.from({ length: 25 }, (_, i) => i);
    const p1 = paginate(all, { limit: 10, offset: 0 });
    expect(p1.items).toHaveLength(10);
    expect(p1.total).toBe(25);
    expect(p1.hasMore).toBe(true);

    const p3 = paginate(all, { limit: 10, offset: 20 });
    expect(p3.items).toEqual([20, 21, 22, 23, 24]);
    expect(p3.hasMore).toBe(false);
  });

  it('makePage computes hasMore from total', () => {
    expect(makePage([1, 2], 2, { limit: 10, offset: 0 }).hasMore).toBe(false);
    expect(makePage([1, 2], 50, { limit: 2, offset: 0 }).hasMore).toBe(true);
  });
});
