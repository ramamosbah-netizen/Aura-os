'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

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

  const statusColor = (s: string): string =>
    s === 'delivered' || s === 'success' ? '#22c55e' : s === 'pending' ? 'var(--muted)' : '#ef4444';

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}

      <section style={st.card}>
        <h2 style={st.h2}>Subscriptions</h2>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>URL</th>
              <th style={st.th}>Events</th>
              <th style={st.th}>Active</th>
              <th style={st.th}></th>
            </tr>
          </thead>
          <tbody>
            {hooks.length === 0 ? (
              <tr><td style={st.td} colSpan={4}>No webhooks registered.</td></tr>
            ) : (
              hooks.map((h) => (
                <tr key={h.id}>
                  <td style={st.tdMono}>{h.url}</td>
                  <td style={st.td}>{h.eventTypes.map((e) => <span key={e} style={st.chip}>{e}</span>)}</td>
                  <td style={st.td}>{h.active ? <span style={{ color: '#22c55e' }}>● on</span> : <span style={{ color: 'var(--muted)' }}>○ off</span>}</td>
                  <td style={st.td}>
                    <button style={st.btnGhost} disabled={busy} onClick={() => toggle(h.id, !h.active)}>
                      {h.active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={register} style={st.form}>
          <input style={{ ...st.input, flex: 2 }} placeholder="https://your-endpoint/hook" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <input style={{ ...st.input, flex: 2 }} placeholder="events, comma-separated (e.g. finance.journal.posted, workflow.*)" value={events} onChange={(e) => setEvents(e.target.value)} required />
          <input style={st.input} placeholder="signing secret (optional)" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <button style={st.btn} disabled={busy} type="submit">Register</button>
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
                  <td style={{ ...st.td, color: statusColor(d.status) }}>{d.status}</td>
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
  btn: { padding: '7px 14px', border: '1px solid var(--accent, #3b82f6)', borderRadius: 6, background: 'var(--accent, #3b82f6)', color: '#fff', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnGhost: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  err: { padding: '10px 12px', border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', marginBottom: 16, fontSize: 13 } as CSSProperties,
};
