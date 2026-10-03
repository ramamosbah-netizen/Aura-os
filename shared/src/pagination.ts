// Shared pagination contract — a uniform offset/total envelope for list endpoints.
// Stores push LIMIT/OFFSET to the database and return the total so callers can page
// without unbounded scans; `paginate` is the in-memory equivalent for array sources.

export interface PageParams {
  limit: number;
  offset: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 500;

/** Normalise raw query input into safe { limit, offset } (clamped, defaulted). */
export function parsePageParams(limit?: unknown, offset?: unknown): PageParams {
  const l = Number(limit);
  const o = Number(offset);
  return {
    limit: Number.isFinite(l) && l > 0 ? Math.min(Math.floor(l), MAX_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT,
    offset: Number.isFinite(o) && o > 0 ? Math.floor(o) : 0,
  };
}

/**
 * PAGE-ORDER-01 — an ORDER BY that pages soundly. Offset paging is only as stable as the order under
 * it: rows that tie on the sort columns (every row one INSERT writes shares its `created_at`) come
 * back in no fixed order between page queries, so one page can repeat a row the last one showed and
 * a row can be shown by none. This appends the table's unique key, in the direction of the last
 * sort key, unless the clause already ends in it.
 */
export function withUniqueTieBreak(orderBy: string, key = 'id'): string {
  const keys = orderBy.split(',').map((k) => k.trim());
  const last = keys[keys.length - 1] ?? '';
  const column = last.replace(/\s+(asc|desc)\b.*$/i, '').trim();
  if (column.toLowerCase() === key.toLowerCase()) return orderBy;
  const direction = /\sdesc\b/i.test(last) ? 'DESC' : 'ASC';
  return `${orderBy}, ${key} ${direction}`;
}

/** Build a Page envelope from a known total and the current window's items. */
export function makePage<T>(items: T[], total: number, params: PageParams): Page<T> {
  return { items, total, limit: params.limit, offset: params.offset, hasMore: params.offset + items.length < total };
}

/** Page an already-materialised array (in-memory stores / small sets). */
export function paginate<T>(all: T[], params: PageParams): Page<T> {
  const items = all.slice(params.offset, params.offset + params.limit);
  return makePage(items, all.length, params);
}
