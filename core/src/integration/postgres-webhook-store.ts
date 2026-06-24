import type { Pool } from 'pg';
import type { Id, WebhookSubscription } from '@aura/shared';
import type { WebhookDelivery, WebhookStore } from './webhook-store';

interface SubRow {
  id: string;
  tenant_id: string;
  event_types: string[];
  url: string;
  secret: string;
  active: boolean;
  created_at: Date | string;
}

interface DelRow {
  id: string;
  subscription_id: string;
  event_id: string;
  event_type: string;
  url: string;
  status: string;
  status_code: number | null;
  error: string | null;
  attempted_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToSub(r: SubRow): WebhookSubscription {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    eventTypes: r.event_types,
    url: r.url,
    secret: r.secret,
    active: r.active,
    createdAt: iso(r.created_at),
  };
}

function rowToDelivery(r: DelRow): WebhookDelivery {
  return {
    id: r.id,
    subscriptionId: r.subscription_id,
    eventId: r.event_id,
    eventType: r.event_type,
    url: r.url,
    status: r.status as WebhookDelivery['status'],
    statusCode: r.status_code,
    error: r.error,
    attemptedAt: iso(r.attempted_at),
  };
}

const SUB_COLS = 'id, tenant_id, event_types, url, secret, active, created_at';
const DEL_COLS = 'id, subscription_id, event_id, event_type, url, status, status_code, error, attempted_at';

/** Durable webhook store on Postgres (`aura_webhook_subscriptions` + `aura_webhook_deliveries`). */
export class PostgresWebhookStore implements WebhookStore {
  constructor(private readonly pool: Pool) {}

  async saveSubscription(sub: WebhookSubscription): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_webhook_subscriptions (${SUB_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         event_types = EXCLUDED.event_types, url = EXCLUDED.url, secret = EXCLUDED.secret, active = EXCLUDED.active`,
      [sub.id, sub.tenantId, JSON.stringify(sub.eventTypes), sub.url, sub.secret, sub.active, sub.createdAt],
    );
  }

  async listSubscriptions(tenantId?: Id): Promise<WebhookSubscription[]> {
    const where = tenantId ? 'WHERE tenant_id = $1' : '';
    const params = tenantId ? [tenantId] : [];
    const res = await this.pool.query<SubRow>(
      `SELECT ${SUB_COLS} FROM public.aura_webhook_subscriptions ${where} ORDER BY created_at DESC`,
      params,
    );
    return res.rows.map(rowToSub);
  }

  async activeSubscriptions(): Promise<WebhookSubscription[]> {
    const res = await this.pool.query<SubRow>(
      `SELECT ${SUB_COLS} FROM public.aura_webhook_subscriptions WHERE active = true`,
    );
    return res.rows.map(rowToSub);
  }

  async recordDelivery(d: WebhookDelivery): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_webhook_deliveries (${DEL_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [d.id, d.subscriptionId, d.eventId, d.eventType, d.url, d.status, d.statusCode, d.error, d.attemptedAt],
    );
  }

  async listDeliveries(subscriptionId?: Id, limit = 50): Promise<WebhookDelivery[]> {
    const where = subscriptionId ? 'WHERE subscription_id = $1' : '';
    const params: unknown[] = subscriptionId ? [subscriptionId] : [];
    params.push(limit);
    const res = await this.pool.query<DelRow>(
      `SELECT ${DEL_COLS} FROM public.aura_webhook_deliveries ${where} ORDER BY attempted_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToDelivery);
  }
}
