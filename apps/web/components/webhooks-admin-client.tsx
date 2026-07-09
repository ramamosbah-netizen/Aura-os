'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

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

export default function WebhooksAdminClient({
  initialWebhooks,
  initialDeliveries,
}: {
  initialWebhooks: Webhook[];
  initialDeliveries: Delivery[];
}) {
  const [hooks, setHooks] = useState<Webhook[]>(initialWebhooks);
  const [deliveries, setDeliveries] = useState<Delivery[]>(initialDeliveries);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('');
  const [secret, setSecret] = useState('');

  const refresh = async (): Promise<void> => {
    const [s, d] = await Promise.all([
      fetch('/api/admin/webhooks', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/admin/webhooks/deliveries', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (Array.isArray(s)) setHooks(s);
    if (Array.isArray(d)) setDeliveries(d);
  };

  const fail = async (res: Response, fallback: string): Promise<void> => {
    const d = await res.json().catch(() => ({}));
    setErr(d.message ?? d.error ?? fallback);
  };

  const register = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          eventTypes: events.split(',').map((s) => s.trim()).filter(Boolean),
          secret: secret.trim() || undefined,
        }),
      });
      if (!res.ok) return fail(res, 'Failed to register webhook');
      setUrl('');
      setEvents('');
      setSecret('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, active: boolean): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/webhooks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) return fail(res, 'Failed to update webhook');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const statusTone = (s: string): 'good' | 'muted' | 'bad' =>
    s === 'delivered' || s === 'success' ? 'good' : s === 'pending' ? 'muted' : 'bad';

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>

      <section style={st.card}>
        <h2 style={st.h2}>Subscriptions</h2>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>Endpoint</th>
              <th style={st.th}>Events</th>
              <th style={{ ...st.th, width: 90, textAlign: 'center' }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {hooks.length === 0 ? (
              <tr><td style={st.td} colSpan={3}>No webhooks registered.</td></tr>
            ) : (
              hooks.map((h) => (
                <tr key={h.id}>
                  <td style={st.tdMono}>
                    {h.url}
                    <div style={{ marginTop: 3 }}>
                      <Pill tone={h.active ? 'good' : 'muted'}>{h.active ? 'delivering' : 'paused'}</Pill>
                    </div>
                  </td>
                  <td style={st.td}>{h.eventTypes.map((e) => <span key={e} style={st.chip}>{e}</span>)}</td>
                  <td style={{ ...st.td, textAlign: 'center' }}>
                    <Toggle on={h.active} disabled={busy} onChange={(next) => void toggle(h.id, next)} title={h.active ? 'Pause delivery' : 'Resume delivery'} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={register} style={st.form}>
          <input className="input" style={{ ...st.input, flex: 2 }} placeholder="https://your-endpoint/hook" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <input className="input" style={{ ...st.input, flex: 2 }} placeholder="events, comma-separated (e.g. finance.journal.posted, workflow.*)" value={events} onChange={(e) => setEvents(e.target.value)} required />
          <input className="input" style={st.input} placeholder="signing secret (optional)" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <button className="btn btn-primary" disabled={busy} type="submit">Register</button>
        </form>
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Recent deliveries</h2>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>Event</th>
              <th style={st.th}>Status</th>
              <th style={st.th}>Attempts</th>
              <th style={st.th}>Error</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.length === 0 ? (
              <tr><td style={st.td} colSpan={4}>No deliveries yet.</td></tr>
            ) : (
              deliveries.map((d) => (
                <tr key={d.id}>
                  <td style={st.tdMono}>{d.eventType}</td>
                  <td style={st.td}><Pill tone={statusTone(d.status)}>{d.status}</Pill></td>
                  <td style={st.td}>{d.attempts}</td>
                  <td style={{ ...st.td, color: 'var(--muted)' }}>{d.lastError ?? ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '18px 18px 14px', marginBottom: 20, background: 'var(--panel)' } as CSSProperties,
  h2: { fontSize: 16, margin: '0 0 12px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  tdMono: { padding: '8px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, wordBreak: 'break-all' } as CSSProperties,
  chip: { display: 'inline-block', fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px', margin: '2px 4px 2px 0' } as CSSProperties,
  form: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' } as CSSProperties,
  input: { flex: 1, minWidth: 140, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', fontSize: 13 } as CSSProperties,
  btn: { padding: '7px 14px', border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--accent-grad)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnGhost: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  err: { padding: '10px 12px', border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', marginBottom: 16, fontSize: 13 } as CSSProperties,
};
