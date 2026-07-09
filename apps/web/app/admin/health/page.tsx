import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import { AdminHeader, AdminCard, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';

export const dynamic = 'force-dynamic';

// Admin Center phase 2 (Vol 15 §2.10): the ops-facing platform health dashboard.
// Everything shown here was already queryable — this page just makes it visible:
// event spine depth, dead letters, webhook delivery health, recent activity.

interface SpineEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt?: string;
  createdAt?: string;
}
interface DeadLetter {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  attempts: number;
  error: string;
}
interface Webhook {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
}
interface Delivery {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError?: string | null;
}

export default async function HealthPage() {
  const [events, deadLetters, webhooks, deliveries] = await Promise.all([
    getJson<SpineEvent[]>('/api/events'),
    getJson<DeadLetter[]>('/api/events/dead-letters'),
    getJson<Webhook[]>('/api/admin/webhooks'),
    getJson<Delivery[]>('/api/admin/webhooks/deliveries'),
  ]);

  if (events === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Platform Health" glyph="🩺" backToHub subtitle="Event spine, dead letters, and delivery health at a glance." />
        <AdminOffline label="Events" />
      </div>
    );
  }

  const dl = deadLetters ?? [];
  const hooks = webhooks ?? [];
  const dels = deliveries ?? [];
  const failedDeliveries = dels.filter((d) => d.status !== 'delivered' && d.status !== 'success' && d.status !== 'pending');
  const activeHooks = hooks.filter((h) => h.active).length;

  const kpis: Kpi[] = [
    {
      label: 'Dead Letters',
      value: dl.length,
      sub: dl.length ? 'events lost after retries — act now' : 'spine is clean',
      tone: dl.length ? 'bad' : 'good',
    },
    {
      label: 'Recent Events',
      value: events.length,
      sub: 'latest window on the spine',
      tone: 'accent',
    },
    {
      label: 'Webhooks',
      value: `${activeHooks}/${hooks.length}`,
      sub: hooks.length ? 'active subscriptions' : 'none registered',
      tone: hooks.length && activeHooks === hooks.length ? 'good' : 'info',
    },
    {
      label: 'Failed Deliveries',
      value: failedDeliveries.length,
      sub: failedDeliveries.length ? 'subscriber endpoints erroring' : 'all deliveries healthy',
      tone: failedDeliveries.length ? 'warn' : 'good',
    },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Platform Health"
        glyph="🩺"
        backToHub
        subtitle="Ops dashboard over the event spine and outbound integrations. For scrape/alerting use /metrics (METRICS_ENABLED) with the shipped Prometheus rule pack."
        kpis={kpis}
      />

      <AdminCard
        title="Dead letters"
        desc="Events that exhausted their retries. Each one is a cross-module reaction that did not happen — replay after fixing the cause."
      >
        {dl.length === 0 ? (
          <p style={st.empty}>None — every event on the spine has been processed. ✓</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Event</th><th>Aggregate</th><th>Attempts</th><th>Error</th></tr>
            </thead>
            <tbody>
              {dl.slice(0, 20).map((d) => (
                <tr key={d.id}>
                  <td style={st.mono}>{d.type}</td>
                  <td style={st.mono}>{d.aggregateType}:{d.aggregateId.slice(0, 8)}</td>
                  <td>{d.attempts}</td>
                  <td style={st.err}>{d.error?.slice(0, 120)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>

      <AdminCard
        title="Webhook delivery health"
        desc="Outbound signed deliveries. Failures usually mean a subscriber endpoint is down — pause it in Webhooks to stop retries."
      >
        {dels.length === 0 ? (
          <p style={st.empty}>No deliveries recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Event</th><th>Status</th><th>Attempts</th><th>Last error</th></tr>
            </thead>
            <tbody>
              {dels.slice(0, 15).map((d) => {
                const ok = d.status === 'delivered' || d.status === 'success';
                return (
                  <tr key={d.id}>
                    <td style={st.mono}>{d.eventType}</td>
                    <td>
                      <span className="badge" style={ok ? st.badgeGood : d.status === 'pending' ? undefined : st.badgeBad}>
                        {d.status}
                      </span>
                    </td>
                    <td>{d.attempts}</td>
                    <td style={st.err}>{d.lastError ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </AdminCard>

      <AdminCard title="Recent activity" desc="The newest events on the spine — the platform's pulse.">
        <table className="data-table">
          <thead>
            <tr><th>Event</th><th>Aggregate</th><th>When</th></tr>
          </thead>
          <tbody>
            {events.slice(0, 15).map((e) => (
              <tr key={e.id}>
                <td style={st.mono}>{e.type}</td>
                <td style={st.mono}>{e.aggregateType}:{e.aggregateId.slice(0, 8)}</td>
                <td style={{ color: 'var(--muted)' }}>
                  {new Date(e.occurredAt ?? e.createdAt ?? Date.now()).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}

const st = {
  empty: { color: 'var(--muted)', fontSize: 13, margin: '6px 2px' } as CSSProperties,
  mono: { fontFamily: 'ui-monospace, monospace', fontSize: 12 } as CSSProperties,
  err: { color: 'var(--muted)', fontSize: 12, wordBreak: 'break-word' } as CSSProperties,
  badgeGood: { background: 'var(--good-soft)', color: 'var(--good)', borderColor: 'transparent' } as CSSProperties,
  badgeBad: { background: 'var(--bad-soft)', color: 'var(--bad)', borderColor: 'transparent' } as CSSProperties,
};
