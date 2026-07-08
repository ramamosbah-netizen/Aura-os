import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import WebhooksAdminClient from '@/components/webhooks-admin-client';

export const dynamic = 'force-dynamic';

interface Webhook {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
}
interface Delivery {
  id: string;
  subscriptionId: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError?: string | null;
}

export default async function WebhooksAdminPage() {
  const [subs, deliveries] = await Promise.all([
    getJson<Webhook[]>('/api/admin/webhooks'),
    getJson<Delivery[]>('/api/admin/webhooks/deliveries'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Administration · Webhooks</h1>
      <p style={st.sub}>
        Register outbound webhooks — any matching event on the spine is POSTed (signed) to your URL.
        Toggle a subscription off to stop delivery without deleting it; the delivery log shows successes and failures.
      </p>
      {subs === null ? (
        <p style={st.muted}>Integration API offline.</p>
      ) : (
        <WebhooksAdminClient initialWebhooks={subs} initialDeliveries={deliveries ?? []} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
