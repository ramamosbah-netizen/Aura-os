import type { Pool } from 'pg';
import { type Page, type PageParams, makePage, paginate } from '@aura/shared';
import type { DocListFilter } from './store.interface';

/**
 * COUNT + windowed SELECT for a paged doc-control list. Callers pass the WHERE
 * fragments/params (see `docWhere`); this bolts on ORDER BY + LIMIT/OFFSET + total.
 */
export async function pagePostgres<T>(
  pool: Pool,
  opts: { table: string; where: string[]; params: unknown[]; orderBy: string; map: (row: any) => T },
  page: PageParams,
): Promise<Page<T>> {
  const whereSql = opts.where.length ? `WHERE ${opts.where.join(' AND ')}` : '';
  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM public.${opts.table} ${whereSql}`,
    opts.params,
  );
  const total = Number(countRes.rows[0]?.count ?? 0);
  const winParams = [...opts.params, page.limit, page.offset];
  const res = await pool.query(
    `SELECT * FROM public.${opts.table} ${whereSql} ORDER BY ${opts.orderBy} LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
    winParams,
  );
  return makePage(res.rows.map(opts.map), total, page);
}

/** Build tenant_id / project_id WHERE fragments for a tenant-wide doc list. */
export function docWhere(filter: DocListFilter): { where: string[]; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.tenantId) {
    params.push(filter.tenantId);
    where.push(`tenant_id = $${params.length}`);
  }
  if (filter.projectId) {
    params.push(filter.projectId);
    where.push(`project_id = $${params.length}`);
  }
  return { where, params };
}

/** In-memory equivalent: filter by tenant/project, sort, slice. */
export function pageDocs<T extends { tenantId: string; projectId: string }>(
  items: Iterable<T>,
  filter: DocListFilter,
  page: PageParams,
  sortCompare: (a: T, b: T) => number,
): Page<T> {
  let all = [...items].map((i) => ({ ...i }));
  if (filter.tenantId) all = all.filter((i) => i.tenantId === filter.tenantId);
  if (filter.projectId) all = all.filter((i) => i.projectId === filter.projectId);
  all.sort(sortCompare);
  return paginate(all, page);
}
