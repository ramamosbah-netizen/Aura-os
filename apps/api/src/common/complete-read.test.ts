import { describe, expect, it } from 'vitest';
import { makePage, paginate, type PageParams } from '@aura/shared';
import { readEveryPage } from './complete-read';

const rows = (n: number, prefix = 'r') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

describe('readEveryPage (F-06)', () => {
  it('reads past every page boundary to the store total — no first-N', async () => {
    const all = rows(2_503);
    const asked: PageParams[] = [];
    const read = await readEveryPage(async (page) => { asked.push(page); return paginate(all, page); }, 1000);
    expect(read).toMatchObject({ total: 2_503, settled: true });
    expect(read.items).toHaveLength(2_503);
    expect(asked.map((p) => p.offset)).toEqual([0, 1000, 2000]);
  });

  it('an empty population is read whole in one page', async () => {
    const read = await readEveryPage(async (page) => paginate([] as Array<{ id: string }>, page));
    expect(read).toEqual({ items: [], total: 0, settled: true });
  });

  it('a page that repeats rows (tied sort keys) is not settled — the duplicate is not counted twice', async () => {
    // What ORDER BY created_at alone can do to tied rows: page two hands back a row page one had,
    // and the row it displaced is never seen. Counting returned rows would read "3 of 3".
    const all = rows(3);
    const read = await readEveryPage(async (page) =>
      makePage(page.offset === 0 ? [all[0], all[1]] : [all[1]], 3, page), 2, 1);
    expect(read.items.map((r) => r.id)).toEqual(['r0', 'r1']);
    expect(read.settled).toBe(false);
  });

  it('a population that moves during the read is read again, and settles when it holds still', async () => {
    const all = rows(4);
    let calls = 0;
    const read = await readEveryPage(async (page) => {
      calls += 1;
      // First pass: a row is written between page one and page two.
      if (calls === 2) all.unshift({ id: 'late' });
      return paginate(all, page);
    }, 2);
    expect(read.settled).toBe(true);
    expect(read.total).toBe(5);
    expect(read.items.map((r) => r.id).sort()).toEqual(['late', 'r0', 'r1', 'r2', 'r3']);
  });

  it('a population that never holds still is reported unsettled, not as whole', async () => {
    const all = rows(4);
    const read = await readEveryPage(async (page) => {
      all.unshift({ id: `w${all.length}` });
      return paginate(all, page);
    }, 2);
    expect(read.settled).toBe(false);
  });
});
