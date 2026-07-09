import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import NotifyAdminClient, { type NotifyStatus } from '@/components/notify-admin-client';

export const dynamic = 'force-dynamic';

// Admin Center phase 2 (Vol 15 §2.8): notification routing — channel defaults,
// per-user recipients, transport status, and the event→notification wirings.
export default async function NotificationsAdminPage() {
  const status = await getJson<NotifyStatus>('/api/admin/platform/notifications');

  if (status === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Notification Routing" glyph="📮" backToHub subtitle="Channels, recipients, and event wirings." />
        <AdminOffline label="Platform" />
      </div>
    );
  }

  const configured = Object.values(status.transports).filter(Boolean).length;
  const channels = status.effective.channels.split(',').map((c) => c.trim()).filter(Boolean);
  const recipients = status.effective.recipients.split(',').filter((p) => p.includes('=')).length;

  const kpis: Kpi[] = [
    { label: 'Transports', value: `${configured}/4`, sub: configured ? 'relay endpoints configured' : 'all log-only (dev)', tone: configured ? 'good' : 'warn' },
    { label: 'Default Channels', value: channels.length || '—', sub: channels.join(', ') || 'none — in-app only', tone: channels.length ? 'accent' : undefined },
    { label: 'Mapped Users', value: recipients, sub: 'per-user recipient map', tone: 'info' },
    { label: 'Event Wirings', value: status.events.length, sub: 'spine events raising notifications' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Notification Routing"
        glyph="📮"
        backToHub
        subtitle="Where notifications go: default channels, the per-user recipient map, and the tenant fallback. Saved as notify.* settings — the dispatcher reads them on every send; env vars remain the fallback."
        kpis={kpis}
      />
      <NotifyAdminClient initial={status} />
    </div>
  );
}
