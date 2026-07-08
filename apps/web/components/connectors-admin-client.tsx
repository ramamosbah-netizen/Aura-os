'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

export interface Connector {
  id: string;
  systemName: string;
  enabled: boolean;
  mappingRules: Record<string, string>;
}

/** Parse "internal:external, a:b" into a mapping-rules object. */
function parseMapping(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of text.split(',')) {
    const [k, v] = pair.split(':').map((s) => s.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

export default function ConnectorsAdminClient({ initialConnectors }: { initialConnectors: Connector[] }) {
  const [connectors, setConnectors] = useState<Connector[]>(initialConnectors);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [systemName, setSystemName] = useState('');
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [mapping, setMapping] = useState('');

  const refresh = async (): Promise<void> => {
    const res = await fetch('/api/admin/connectors', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setConnectors(d);
    }
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
      const res = await fetch('/api/admin/connectors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemName: systemName.trim(),
          authConfig: { url: url.trim(), apiKey: apiKey.trim() || undefined },
          mappingRules: parseMapping(mapping),
          enabled: true,
        }),
      });
      if (!res.ok) return fail(res, 'Failed to register connector');
      setSystemName('');
      setUrl('');
      setApiKey('');
      setMapping('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, enabled: boolean): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/connectors/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) return fail(res, 'Failed to update connector');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}

      <section style={st.card}>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>System</th>
              <th style={st.th}>Field mappings</th>
              <th style={st.th}>Active</th>
              <th style={st.th}></th>
            </tr>
          </thead>
          <tbody>
            {connectors.length === 0 ? (
              <tr><td style={st.td} colSpan={4}>No connectors registered.</td></tr>
            ) : (
              connectors.map((c) => (
                <tr key={c.id}>
                  <td style={st.td}>{c.systemName}</td>
                  <td style={st.tdMono}>
                    {Object.entries(c.mappingRules).length === 0
                      ? <span style={{ color: 'var(--muted)' }}>—</span>
                      : Object.entries(c.mappingRules).map(([k, v]) => <span key={k} style={st.chip}>{k}→{v}</span>)}
                  </td>
                  <td style={st.td}>{c.enabled ? <span style={{ color: '#22c55e' }}>● on</span> : <span style={{ color: 'var(--muted)' }}>○ off</span>}</td>
                  <td style={st.td}>
                    <button style={st.btnGhost} disabled={busy} onClick={() => toggle(c.id, !c.enabled)}>
                      {c.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={register} style={st.form}>
          <input style={st.input} placeholder="system name (e.g. SAP)" value={systemName} onChange={(e) => setSystemName(e.target.value)} required />
          <input style={{ ...st.input, flex: 2 }} placeholder="endpoint url" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input style={st.input} type="password" placeholder="api key (write-only)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <input style={{ ...st.input, flex: 2 }} placeholder="field mappings (e.g. total:amount, ref:externalId)" value={mapping} onChange={(e) => setMapping(e.target.value)} />
          <button style={st.btn} disabled={busy} type="submit">Register</button>
        </form>
      </section>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '18px 18px 14px', background: 'var(--panel)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  tdMono: { padding: '8px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12 } as CSSProperties,
  chip: { display: 'inline-block', fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px', margin: '2px 4px 2px 0' } as CSSProperties,
  form: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' } as CSSProperties,
  input: { flex: 1, minWidth: 130, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', fontSize: 13 } as CSSProperties,
  btn: { padding: '7px 14px', border: '1px solid var(--accent, #3b82f6)', borderRadius: 6, background: 'var(--accent, #3b82f6)', color: '#fff', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnGhost: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  err: { padding: '10px 12px', border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', marginBottom: 16, fontSize: 13 } as CSSProperties,
};
