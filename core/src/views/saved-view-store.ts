import type { Pool } from 'pg';
import { newId } from '@aura/shared';

export interface SavedView {
  id: string;
  tenantId: string;
  userId: string | null;
  label: string;
  path: string;   // route pathname, e.g. /finance/customer-invoices
  query: string;  // querystring, e.g. status=issued
  createdAt: string;
}
export interface NewSavedView {
  tenantId: string; userId?: string | null; label: string; path: string; query?: string | null;
}
export function makeSavedView(i: NewSavedView): SavedView {
  if (!i.label?.trim()) throw new Error('label is required');
  if (!i.path?.trim()) throw new Error('path is required');
  return {
    id: newId(), tenantId: i.tenantId, userId: i.userId ?? null,
    label: i.label.trim(), path: i.path.trim(), query: (i.query ?? '').replace(/^\?/, ''),
    createdAt: new Date().toISOString(),
  };
}

export const SAVED_VIEW_STORE = Symbol('SAVED_VIEW_STORE');

/**
 * OWNERSHIP IS PART OF THE CONTRACT, not a filter a caller may forget.
 *
 * Two kinds of row live here and they are NOT interchangeable:
 *   userId = <a user>  a PRIVATE view. Visible to, and deletable by, that user alone.
 *   userId = null      a TENANT-WIDE view. Visible to everyone; deleting one is a shared-state
 *                      change, so it needs an explicit decision by the caller, never "it was on my
 *                      screen so I may remove it".
 *
 * `list` and `remove` therefore take the viewer. They used to take only the tenant, so
 * `GET /views` returned every colleague's private views and `DELETE /views/:id` deleted any of them
 * by id — the UI filtered for display and that was the only thing standing in the way.
 */
export interface SavedViewStore {
  save(v: SavedView): Promise<void>;
  /** Atomically toggle one private view. The database implementation serialises concurrent clicks. */
  toggleFavorite(v: SavedView): Promise<{ favorited: boolean; view: SavedView | null }>;
  /** Tenant-wide views plus `viewerId`'s own. NEVER another user's private view. */
  list(tenantId: string, viewerId: string | null, path?: string): Promise<SavedView[]>;
  /** Exact private-view lookup used by rename/favourite flows; never returns a shared row. */
  findExact(tenantId: string, userId: string, path: string, query: string): Promise<SavedView | null>;
  /** Read one for an ownership decision; `null` when it is not in this tenant. */
  get(tenantId: string, id: string): Promise<SavedView | null>;
  remove(tenantId: string, id: string): Promise<void>;
}

export class InMemorySavedViewStore implements SavedViewStore {
  private m = new Map<string, SavedView>();
  async save(v: SavedView) { this.m.set(v.id, { ...v }); }
  async toggleFavorite(v: SavedView) {
    const existing = [...this.m.values()].find((candidate) => candidate.tenantId === v.tenantId && candidate.userId === v.userId && candidate.path === v.path && candidate.query === v.query);
    if (existing) {
      this.m.delete(existing.id);
      return { favorited: false, view: null };
    }
    this.m.set(v.id, { ...v });
    return { favorited: true, view: { ...v } };
  }
  async list(tenantId: string, viewerId: string | null, path?: string) {
    return [...this.m.values()]
      .filter((v) => v.tenantId === tenantId && (!path || v.path === path))
      // Mirror of the SQL predicate: shared, or mine. An anonymous viewer sees only shared ones.
      .filter((v) => v.userId === null || (viewerId !== null && v.userId === viewerId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  async findExact(tenantId: string, userId: string, path: string, query: string) {
    const v = [...this.m.values()].find((candidate) => candidate.tenantId === tenantId && candidate.userId === userId && candidate.path === path && candidate.query === query);
    return v ? { ...v } : null;
  }
  async get(tenantId: string, id: string) {
    const v = this.m.get(id);
    return v && v.tenantId === tenantId ? { ...v } : null;
  }
  async remove(tenantId: string, id: string) {
    const v = this.m.get(id); if (v && v.tenantId === tenantId) this.m.delete(id);
  }
}

interface Row { id: string; tenant_id: string; user_id: string | null; label: string; path: string; query: string; created_at: Date | string }
const COLS = 'id, tenant_id, user_id, label, path, query, created_at';
const toV = (r: Row): SavedView => ({
  id: r.id, tenantId: r.tenant_id, userId: r.user_id, label: r.label, path: r.path, query: r.query,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
});

export class PostgresSavedViewStore implements SavedViewStore {
  constructor(private readonly pool: Pool) {}
  async save(v: SavedView) {
    // `create()` can rename an existing row. Upsert by id makes that update explicit instead of
    // attempting a second INSERT with the same primary key.
    await this.pool.query(`INSERT INTO public.aura_saved_views (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, path=EXCLUDED.path, query=EXCLUDED.query`,
      [v.id, v.tenantId, v.userId, v.label, v.path, v.query, v.createdAt]);
  }
  async toggleFavorite(v: SavedView) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // A transaction-scoped advisory lock gives the toggle true read/decide/write semantics even
      // when two browser clicks arrive before either response. The key is deliberately scoped to
      // this tenant, user and exact route+query; unrelated favourites do not block one another.
      const lockKey = `${v.tenantId}\u001f${v.userId ?? ''}\u001f${v.path}\u001f${v.query}`;
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);
      const existing = await client.query<Row>(
        `SELECT ${COLS} FROM public.aura_saved_views
          WHERE tenant_id=$1 AND user_id=$2 AND path=$3 AND query=$4
          LIMIT 1 FOR UPDATE`,
        [v.tenantId, v.userId, v.path, v.query],
      );
      if (existing.rows[0]) {
        const current = toV(existing.rows[0]);
        await client.query('DELETE FROM public.aura_saved_views WHERE tenant_id=$1 AND id=$2', [v.tenantId, current.id]);
        await client.query('COMMIT');
        return { favorited: false, view: null };
      }
      await client.query(`INSERT INTO public.aura_saved_views (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [v.id, v.tenantId, v.userId, v.label, v.path, v.query, v.createdAt]);
      await client.query('COMMIT');
      return { favorited: true, view: v };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async list(tenantId: string, viewerId: string | null, path?: string) {
    // Ownership in the WHERE clause, not in the caller: a shared view (user_id IS NULL) or one of
    // the viewer's own. A null viewer sees only shared views rather than everything.
    const p: unknown[] = [tenantId, viewerId];
    let sql = `SELECT ${COLS} FROM public.aura_saved_views
                 WHERE tenant_id=$1 AND (user_id IS NULL OR ($2::text IS NOT NULL AND user_id=$2))`;
    if (path) { p.push(path); sql += ` AND path=$3`; }
    sql += ` ORDER BY created_at DESC`;
    return (await this.pool.query<Row>(sql, p)).rows.map(toV);
  }
  async findExact(tenantId: string, userId: string, path: string, query: string) {
    const r = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_saved_views
        WHERE tenant_id=$1 AND user_id=$2 AND path=$3 AND query=$4
        LIMIT 1`,
      [tenantId, userId, path, query],
    );
    return r.rows[0] ? toV(r.rows[0]) : null;
  }
  async get(tenantId: string, id: string) {
    const r = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_saved_views WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
    return r.rows[0] ? toV(r.rows[0]) : null;
  }
  async remove(tenantId: string, id: string) {
    await this.pool.query('DELETE FROM public.aura_saved_views WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
  }
}
