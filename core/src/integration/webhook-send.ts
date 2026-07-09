import { signPayload } from '@aura/shared';
import { metrics } from '../observability/metrics';

export interface WebhookSendResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
}

/**
 * POST a signed webhook body once. Never throws — network/HTTP failures become a result,
 * so callers (dispatcher first-try + retry worker) can record + reschedule uniformly.
 * The signature is recomputed from the (stored) body, so retries are self-contained.
 */
export async function sendWebhook(
  url: string,
  secret: string,
  body: string,
  eventType: string,
): Promise<WebhookSendResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-aura-event': eventType,
        'x-aura-signature': signPayload(secret, body),
      },
      body,
    });
    metrics.inc('webhook_deliveries_total', { outcome: res.ok ? 'ok' : 'failed' });
    return { ok: res.ok, statusCode: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    metrics.inc('webhook_deliveries_total', { outcome: 'failed' });
    return { ok: false, statusCode: null, error: err instanceof Error ? err.message : String(err) };
  }
}
