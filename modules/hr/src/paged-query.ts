import type { Pool } from 'pg';
import { type Page, type PageParams, makePage } from '@aura/shared';
import type { EmployeeScopedFilter } from './store.interface';

/**
 * Run a COUNT + windowed SELECT for a paged list against one HR table.
 * Callers supply the WHERE fragments/params (see `scopedWhere`) so the taxonomy
 * of filters stays with the store; this only bolts on LIMIT/OFFSET + the total.
 */
export async function pagePostgres<T>(
  pool: Pool,
  opts: { table: string; cols?: string; where: string[]; params: unknown[]; orderBy: string; map: (row: any) => T },
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
    `SELECT ${opts.cols ?? '*'} FROM public.${opts.table} ${whereSql} ORDER BY ${opts.orderBy} LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
    winParams,
  );
  return makePage(res.rows.map(opts.map), total, page);
}

/** Build tenant_id / employee_id WHERE fragments for an employee-scoped child list. */
export function scopedWhere(filter: EmployeeScopedFilter): { where: string[]; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.tenantId) {
    params.push(filter.tenantId);
    where.push(`tenant_id = $${params.length}`);
  }
  if (filter.employeeId) {
    params.push(filter.employeeId);
    where.push(`employee_id = $${params.length}`);
  }
  return { where, params };
}
