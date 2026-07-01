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
export interface SavedViewStore {
  save(v: SavedView): Promise<void>;
  list(tenantId: string, path?: string): Promise<SavedView[]>;
  remove(tenantId: string, id: string): Promise<void>;
}

export class InMemorySavedViewStore implements SavedViewStore {
  private m = new Map<string, SavedView>();
  async save(v: SavedView) { this.m.set(v.id, { ...v }); }
  async list(tenantId: string, path?: string) {
    return [...this.m.values()].filter((v) => v.tenantId === tenantId && (!path || v.path === path))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
    await this.pool.query(`INSERT INTO public.aura_saved_views (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [v.id, v.tenantId, v.userId, v.label, v.path, v.query, v.createdAt]);
  }
  async list(tenantId: string, path?: string) {
    const p: unknown[] = [tenantId]; let sql = `SELECT ${COLS} FROM public.aura_saved_views WHERE tenant_id=$1`;
    if (path) { p.push(path); sql += ` AND path=$2`; }
    sql += ` ORDER BY created_at DESC`;
    return (await this.pool.query<Row>(sql, p)).rows.map(toV);
  }
  async remove(tenantId: string, id: string) {
    await this.pool.query('DELETE FROM public.aura_saved_views WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
  }
}
