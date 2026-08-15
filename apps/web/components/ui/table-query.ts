// table-query — the pure query engine behind AuraDataTable.
//
// Extracted so the register's behaviour (search → filter → sort → paginate, page reset, and
// URL (de)serialisation) is verifiable in isolation, without a DOM. The component composes
// these; the tests in table-query.test.ts pin them. No React, no side effects.

export interface TableQueryState {
  search: string;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  page: number;
  filters: Record<string, string>;
}

/** Free-text search. When `searchFields` is given, only those fields are scanned; else all values. */
export function applySearch<T extends Record<string, unknown>>(
  rows: T[],
  search: string,
  searchFields?: (keyof T)[],
): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((item) => {
    const values = searchFields && searchFields.length > 0 ? searchFields.map((f) => item[f]) : Object.values(item);
    return values.some((val) => val !== null && val !== undefined && String(val).toLowerCase().includes(q));
  });
}

/** Exact-match faceting: for each non-empty value, keep rows whose field equals it (string-compared). */
export function applyFilters<T extends Record<string, unknown>>(rows: T[], filterVals: Record<string, string>): T[] {
  const active = Object.entries(filterVals).filter(([, v]) => v);
  if (active.length === 0) return rows;
  return rows.filter((item) => active.every(([k, v]) => String(item[k] ?? '') === v));
}

/** Stable-ish sort with null/undefined pushed last, direction-aware. Returns a new array. */
export function applySort<T extends Record<string, unknown>>(rows: T[], sortKey: string | null, sortDir: 'asc' | 'desc'): T[] {
  if (!sortKey) return rows;
  return [...rows].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    const cmp = va < vb ? -1 : 1;
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

export function pageCountOf(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Clamp a requested page into [1, pageCount] — guards against a filter shrinking the result set. */
export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), pageCount);
}

export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0) return rows;
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

// ── URL (de)serialisation ─────────────────────────────────────────────────────────
// Params are prefixed so multiple tables on one page never collide. Defaults are omitted
// from the URL to keep it clean and to make "no query" the canonical empty state.

export function paramName(urlKey: string, field: string): string {
  return `${urlKey}_${field}`;
}

/** Write the query into a copy of `current`, deleting any param equal to its default. */
export function serializeQuery(
  current: URLSearchParams,
  urlKey: string,
  state: TableQueryState,
  filterKeys: string[],
): URLSearchParams {
  const next = new URLSearchParams(current);
  const put = (field: string, value: string, dflt: string) => {
    if (value && value !== dflt) next.set(paramName(urlKey, field), value);
    else next.delete(paramName(urlKey, field));
  };
  put('q', state.search, '');
  put('sort', state.sortKey ?? '', '');
  put('dir', state.sortDir, 'asc');
  put('page', String(state.page), '1');
  for (const k of filterKeys) put(`f_${k}`, state.filters[k] ?? '', '');
  return next;
}

/** Read the query back out of URL params, falling back to defaults. */
export function parseQuery(
  params: URLSearchParams,
  urlKey: string,
  filterKeys: string[],
  defaults?: Partial<TableQueryState>,
): TableQueryState {
  const get = (field: string) => params.get(paramName(urlKey, field));
  const filters: Record<string, string> = {};
  for (const k of filterKeys) filters[k] = get(`f_${k}`) ?? '';
  const pageRaw = parseInt(get('page') ?? '', 10);
  return {
    search: get('q') ?? defaults?.search ?? '',
    sortKey: get('sort') || defaults?.sortKey || null,
    sortDir: (get('dir') || defaults?.sortDir) === 'desc' ? 'desc' : 'asc',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : (defaults?.page ?? 1),
    filters,
  };
}
