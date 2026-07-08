'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

export interface TenantSetting {
  key: string;
  value: string;
  description: string;
}

export default function SettingsAdminClient({ initialSettings }: { initialSettings: TenantSetting[] }) {
  const [settings, setSettings] = useState<TenantSetting[]>(initialSettings);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [desc, setDesc] = useState('');

  const refresh = async (): Promise<void> => {
    const res = await fetch('/api/admin/settings', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setSettings(d);
    }
  };

  const fail = async (res: Response, fallback: string): Promise<void> => {
    const d = await res.json().catch(() => ({}));
    setErr(d.message ?? d.error ?? fallback);
  };

  const edit = (s: TenantSetting): void => {
    setKey(s.key);
    setValue(s.value);
    setDesc(s.description);
    setErr(null);
  };

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), value, description: desc.trim() }),
      });
      if (!res.ok) return fail(res, 'Failed to save setting');
      setKey('');
      setValue('');
      setDesc('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (k: string): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(k)}`, { method: 'DELETE' });
      if (!res.ok) return fail(res, 'Failed to remove setting');
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
              <th style={st.th}>Key</th>
              <th style={st.th}>Value</th>
              <th style={st.th}>Description</th>
              <th style={st.th}></th>
            </tr>
          </thead>
          <tbody>
            {settings.length === 0 ? (
              <tr><td style={st.td} colSpan={4}>No settings yet — add one below.</td></tr>
            ) : (
              settings.map((s) => (
                <tr key={s.key}>
                  <td style={st.tdMono}>{s.key}</td>
                  <td style={st.td}>{s.value}</td>
                  <td style={{ ...st.td, color: 'var(--muted)' }}>{s.description}</td>
                  <td style={st.td}>
                    <button style={st.btnGhost} disabled={busy} onClick={() => edit(s)}>Edit</button>
                    <button style={st.btnGhost} disabled={busy} onClick={() => remove(s.key)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={save} style={st.form}>
          <input style={st.input} placeholder="key (e.g. finance.defaultCurrency)" value={key} onChange={(e) => setKey(e.target.value)} required />
          <input style={st.input} placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} />
          <input style={{ ...st.input, flex: 2 }} placeholder="description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button style={st.btn} disabled={busy} type="submit">Save</button>
        </form>
      </section>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '18px 18px 14px', background: 'var(--panel)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdMono: { padding: '8px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 } as CSSProperties,
  form: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' } as CSSProperties,
  input: { flex: 1, minWidth: 140, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', fontSize: 13 } as CSSProperties,
  btn: { padding: '7px 14px', border: '1px solid var(--accent, #3b82f6)', borderRadius: 6, background: 'var(--accent, #3b82f6)', color: '#fff', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnGhost: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', marginRight: 6 } as CSSProperties,
  err: { padding: '10px 12px', border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', marginBottom: 16, fontSize: 13 } as CSSProperties,
};
