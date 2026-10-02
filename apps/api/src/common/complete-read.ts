import type { Page, PageParams } from '@aura/shared';

/**
 * F-06 — read a population whole, page after page, and say whether it held still while it was read.
 *
 * A list read with a limit answers "the first N", and every executive figure built on one was a
 * figure over whatever N happened to be. This reads until the store's own total is reached.
 *
 * Offset paging is only as sound as the order beneath it, so a store read this way must order by a
 * unique key last — `created_at` alone ties for every row one statement wrote, and tied rows may come
 * back in a different order on the next page's query, repeating some and never returning others.
 * Two checks cover what paging cannot: a row seen twice is kept once, and the read is SETTLED only
 * when every page agreed on the total and the distinct rows read are exactly that total. A read that
 * does not settle (rows were written or removed while it ran) is taken once more; if it still does
 * not settle, the caller is told so — a short read is never handed back as a whole one.
 */
export interface CompleteRead<T> {
  items: T[];
  /** The store's own count, as of the last page read. */
  total: number;
  /** Every page agreed on the total and the distinct rows read are exactly that many. */
  settled: boolean;
}

export const COMPLETE_READ_PAGE = 1000;

export async function readEveryPage<T extends { id: string }>(
  fetchPage: (page: PageParams) => Promise<Page<T>>,
  pageSize = COMPLETE_READ_PAGE,
  attempts = 2,
): Promise<CompleteRead<T>> {
  let last: CompleteRead<T> = { items: [], total: 0, settled: false };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const seen = new Map<string, T>();
    let firstTotal: number | null = null;
    let total = 0;
    let steady = true;
    for (let offset = 0; ; offset += pageSize) {
      const page = await fetchPage({ limit: pageSize, offset });
      if (firstTotal === null) firstTotal = page.total;
      else if (page.total !== firstTotal) steady = false;
      total = page.total;
      for (const item of page.items) if (!seen.has(item.id)) seen.set(item.id, item);
      if (page.items.length < pageSize || offset + pageSize >= page.total) break;
    }
    last = { items: [...seen.values()], total, settled: steady && seen.size === total };
    if (last.settled) return last;
  }
  return last;
}
