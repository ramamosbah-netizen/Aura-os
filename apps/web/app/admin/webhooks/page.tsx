import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
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

  if (subs === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Webhooks" glyph="📡" backToHub subtitle="Signed event delivery to your endpoints, with a delivery log." />
        <AdminOffline label="Integration" />
      </div>
    );
  }

  const dels = deliveries ?? [];
  const active = subs.filter((w) => w.active).length;
  const failed = dels.filter((d) => d.status !== 'delivered' && d.status !== 'success' && d.status !== 'pending').length;
  const kpis: Kpi[] = [
    { label: 'Subscriptions', value: subs.length, sub: `${active} active`, tone: 'accent' },
    { label: 'Deliveries', value: dels.length, sub: 'logged attempts', tone: 'info' },
    { label: 'Failed', value: failed, sub: 'need attention', tone: failed > 0 ? 'bad' : 'good' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Webhooks"
        glyph="📡"
        backToHub
        subtitle="Register outbound webhooks — any matching event on the spine is POSTed (signed) to your URL. Toggle a subscription off to stop delivery without deleting it; the delivery log shows successes and failures."
        kpis={kpis}
      />
      <WebhooksAdminClient initialWebhooks={subs} initialDeliveries={dels} />
    </div>
  );
}
