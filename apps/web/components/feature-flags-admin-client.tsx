'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

interface FlagRule {
  tenantId: string;
  enabled: boolean;
}
export interface FeatureFlag {
  flagKey: string;
  description: string;
  enabledDefault: boolean;
  rules: FlagRule[];
}

export default function FeatureFlagsAdminClient({ initialFlags }: { initialFlags: FeatureFlag[] }) {
  const [flags, setFlags] = useState<FeatureFlag[]>(initialFlags);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [key, setKey] = useState('');
  const [desc, setDesc] = useState('');
  const [def, setDef] = useState(false);

  const refresh = async (): Promise<void> => {
    const res = await fetch('/api/admin/feature-flags', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setFlags(d);
    }
  };

  const set = async (flag: FeatureFlag, enabledDefault: boolean): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ flagKey: flag.flagKey, enabledDefault, description: flag.description, rules: flag.rules }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to update flag');
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const addFlag = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ flagKey: key.trim(), description: desc.trim(), enabledDefault: def, rules: [] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to add flag');
        return;
      }
      setKey('');
      setDesc('');
      setDef(false);
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
              <th style={st.th}>Flag</th>
              <th style={st.th}>Description</th>
              <th style={st.th}>Default</th>
              <th style={st.th}>Overrides</th>
              <th style={st.th}></th>
            </tr>
          </thead>
          <tbody>
            {flags.length === 0 ? (
              <tr><td style={st.td} colSpan={5}>No flags yet — add one below.</td></tr>
            ) : (
              flags.map((f) => (
                <tr key={f.flagKey}>
                  <td style={st.tdMono}>{f.flagKey}</td>
                  <td style={st.td}>{f.description || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td style={st.td}>{f.enabledDefault ? <span style={{ color: '#22c55e' }}>● on</span> : <span style={{ color: 'var(--muted)' }}>○ off</span>}</td>
                  <td style={st.td}>{f.rules.length || <span style={{ color: 'var(--muted)' }}>0</span>}</td>
                  <td style={st.td}>
                    <button style={st.btnGhost} disabled={busy} onClick={() => set(f, !f.enabledDefault)}>
                      {f.enabledDefault ? 'Turn off' : 'Turn on'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={addFlag} style={st.form}>
          <input style={st.input} placeholder="flag key (e.g. new-invoice-ui)" value={key} onChange={(e) => setKey(e.target.value)} required />
          <input style={{ ...st.input, flex: 2 }} placeholder="description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <label style={st.check}>
            <input type="checkbox" checked={def} onChange={(e) => setDef(e.target.checked)} /> on by default
          </label>
          <button style={st.btn} disabled={busy} type="submit">Add flag</button>
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
  form: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { flex: 1, minWidth: 140, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', fontSize: 13 } as CSSProperties,
  check: { display: 'flex', gap: 6, alignItems: 'center', color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  btn: { padding: '7px 14px', border: '1px solid var(--accent, #3b82f6)', borderRadius: 6, background: 'var(--accent, #3b82f6)', color: '#fff', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnGhost: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  err: { padding: '10px 12px', border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', marginBottom: 16, fontSize: 13 } as CSSProperties,
};
