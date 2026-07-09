'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

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
      <ErrorBanner>{err}</ErrorBanner>

      <section style={st.card}>
        {flags.length === 0 ? (
          <p style={st.emptyLead}>No flags yet — add the first one below.</p>
        ) : (
          <div>
            {flags.map((f) => (
              <div key={f.flagKey} style={st.flagRow}>
                <Toggle
                  on={f.enabledDefault}
                  disabled={busy}
                  onChange={(next) => void set(f, next)}
                  title={f.enabledDefault ? 'Turn off (default)' : 'Turn on (default)'}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={st.flagKey}>{f.flagKey}</div>
                  <div style={st.flagDesc}>{f.description || 'No description'}</div>
                </div>
                {f.rules.length > 0 ? (
                  <Pill tone="info">{f.rules.length} tenant override{f.rules.length === 1 ? '' : 's'}</Pill>
                ) : (
                  <Pill tone="muted">no overrides</Pill>
                )}
                <Pill tone={f.enabledDefault ? 'good' : 'muted'}>{f.enabledDefault ? 'ON by default' : 'off by default'}</Pill>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addFlag} style={st.form}>
          <input className="input" style={st.input} placeholder="flag key (e.g. new-invoice-ui)" value={key} onChange={(e) => setKey(e.target.value)} required />
          <input className="input" style={{ ...st.input, flex: 2 }} placeholder="description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <label style={st.check}>
            <Toggle on={def} onChange={setDef} /> on by default
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">Add flag</button>
        </form>
      </section>
    </div>
  );
}

const st = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 18,
    background: 'var(--panel)',
    boxShadow: 'var(--shadow-sm)',
  } as CSSProperties,
  flagRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '11px 6px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  flagKey: { fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700 } as CSSProperties,
  flagDesc: { fontSize: 12, color: 'var(--muted)', marginTop: 1 } as CSSProperties,
  emptyLead: { color: 'var(--muted)', margin: '4px 0 10px', fontSize: 13 } as CSSProperties,
  form: { display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { flex: 1, minWidth: 160, padding: '8px 10px', fontSize: 13 } as CSSProperties,
  check: { display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
};
