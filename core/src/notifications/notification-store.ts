import type { Pool } from 'pg';
import { newId } from '@aura/shared';

// Persisted notifications — the inbox/"notification center". Delivery channels (email/SMS/
// slack) are dispatched by NotificationService; this store is the durable record + read state.

export interface Notification {
  id: string;
  tenantId: string;
  userId: string | null;
  title: string;
  body: string;
  category: string; // e.g. 'procurement' | 'finance' | 'contracts'
  refType: string | null;
  refId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NewNotification {
  tenantId: string;
  userId?: string | null;
  title: string;
  body: string;
  category?: string;
  refType?: string | null;
  refId?: string | null;
}

export function makeNotification(input: NewNotification): Notification {
  return {
    id: newId(),
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title,
    body: input.body,
    category: input.category ?? 'general',
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export const NOTIFICATION_STORE = Symbol('NOTIFICATION_STORE');

export interface NotificationFilter {
  tenantId: string;
  unreadOnly?: boolean;
  limit?: number;
}

export interface NotificationStore {
  save(n: Notification): Promise<void>;
  list(filter: NotificationFilter): Promise<Notification[]>;
  markRead(tenantId: string, id: string): Promise<void>;
  unreadCount(tenantId: string): Promise<number>;
}

export class InMemoryNotificationStore implements NotificationStore {
  private readonly data = new Map<string, Notification>();

  async save(n: Notification): Promise<void> {
    this.data.set(n.id, { ...n });
  }
  async list(filter: NotificationFilter): Promise<Notification[]> {
    let out = [...this.data.values()].filter((n) => n.tenantId === filter.tenantId);
    if (filter.unreadOnly) out = out.filter((n) => !n.read);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
  async markRead(tenantId: string, id: string): Promise<void> {
    const n = this.data.get(id);
    if (n && n.tenantId === tenantId) n.read = true;
  }
  async unreadCount(tenantId: string): Promise<number> {
    return [...this.data.values()].filter((n) => n.tenantId === tenantId && !n.read).length;
  }
}

interface Row {
  id: string; tenant_id: string; user_id: string | null; title: string; body: string;
  category: string; ref_type: string | null; ref_id: string | null; read: boolean; created_at: Date | string;
}
const COLS = 'id, tenant_id, user_id, title, body, category, ref_type, ref_id, read, created_at';
function toN(r: Row): Notification {
  return {
    id: r.id, tenantId: r.tenant_id, userId: r.user_id, title: r.title, body: r.body,
    category: r.category, refType: r.ref_type, refId: r.ref_id, read: r.read,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresNotificationStore implements NotificationStore {
  constructor(private readonly pool: Pool) {}

  async save(n: Notification): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_notifications (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [n.id, n.tenantId, n.userId, n.title, n.body, n.category, n.refType, n.refId, n.read, n.createdAt],
    );
  }
  async list(filter: NotificationFilter): Promise<Notification[]> {
    const params: unknown[] = [filter.tenantId];
    let sql = `SELECT ${COLS} FROM public.aura_notifications WHERE tenant_id = $1`;
    if (filter.unreadOnly) sql += ' AND read = false';
    params.push(filter.limit ?? 100);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const res = await this.pool.query<Row>(sql, params);
    return res.rows.map(toN);
  }
  async markRead(tenantId: string, id: string): Promise<void> {
    await this.pool.query('UPDATE public.aura_notifications SET read = true WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  }
  async unreadCount(tenantId: string): Promise<number> {
    const res = await this.pool.query<{ c: string }>('SELECT COUNT(*)::int AS c FROM public.aura_notifications WHERE tenant_id = $1 AND read = false', [tenantId]);
    return res.rows.length ? Number(res.rows[0].c) : 0;
  }
}
