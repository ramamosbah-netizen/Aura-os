'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill } from './admin-ui';

// Service accounts / API keys (Vol 15 §2.5) — the /admin/security section. Creation
// shows the key exactly once (only its hash is stored server-side); the account acts
// as `sa:<id>` and gets its permissions via role grants at /admin/access.

interface ServiceAccount {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function ServiceAccountsClient() {
  const [accounts, setAccounts] = useState<ServiceAccount[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [minted, setMinted] = useState<{ id: string; key: string; grantHint: string } | null>(null);

  const load = async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/service-accounts', { cache: 'no-store' });
      if (res.ok) setAccounts(((await res.json()) as { accounts: ServiceAccount[] }).accounts);
    } catch {
      /* section shows loading state */
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async (): Promise<void> => {
    setErr(null);
    setMinted(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/service-accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Create failed');
        return;
      }
      setMinted({ id: d.account.id, key: d.key, grantHint: d.grantHint });
      setName('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (a: ServiceAccount, active: boolean): Promise<void> => {
    if (!active && !window.confirm(`Revoke the key for "${a.name}" (${a.id})? Requests using it fail immediately.`)) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/service-accounts/${encodeURIComponent(a.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Update failed');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: ServiceAccount): Promise<void> => {
    if (!window.confirm(`Delete service account "${a.name}" (${a.id})? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/service-accounts/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>

      {minted && (
        <div style={st.mintBox}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Key for {minted.id} — copy it now, it is shown only once:</div>
          <code style={st.keyCode}>{minted.key}</code>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>{minted.grantHint}</div>
        </div>
      )}

      {accounts === null ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 12px' }}>
          No API keys yet. Create one for each external integration — the @aura/sdk client takes it as its token.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={st.th}>Account</th>
              <th style={st.th}>Name</th>
              <th style={st.th}>Status</th>
              <th style={st.th}>Last used</th>
              <th style={{ ...st.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} style={!a.active ? { opacity: 0.55 } : undefined}>
                <td style={st.td}><code style={st.code}>sa:{a.id}</code></td>
                <td style={st.td}>{a.name}</td>
                <td style={st.td}>{a.active ? <Pill tone="good">active</Pill> : <Pill tone="bad">revoked</Pill>}</td>
                <td style={st.td}>{a.lastUsedAt ? new Date(a.lastUsedAt).toLocaleString() : <span style={{ color: 'var(--muted)' }}>never</span>}</td>
                <td style={{ ...st.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {a.active ? (
                    <button className="btn" style={{ ...st.smallBtn, color: 'var(--bad)' }} disabled={busy} onClick={() => void setActive(a, false)}>
                      Revoke
                    </button>
                  ) : (
                    <>
                      <button className="btn" style={st.smallBtn} disabled={busy} onClick={() => void setActive(a, true)}>
                        Reinstate
                      </button>{' '}
                      <button className="btn" style={st.smallBtn} disabled={busy} onClick={() => void remove(a)}>
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" style={{ width: 260 }} placeholder="integration name (e.g. Power BI sync)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void create()}>
          Create API key
        </button>
      </div>
    </div>
  );
}

const st = {
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '6px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 4px' } as CSSProperties,
  smallBtn: { fontSize: 12, padding: '4px 10px' } as CSSProperties,
  mintBox: { border: '1px solid var(--warn)', background: 'var(--warn-soft)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13 } as CSSProperties,
  keyCode: { display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', wordBreak: 'break-all', userSelect: 'all' } as CSSProperties,
};
