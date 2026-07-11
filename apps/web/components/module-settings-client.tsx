'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { MODULE_SETTINGS_CATALOG, type ModuleSettingSpec } from '@aura/shared';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

// Per-module business settings (Admin Center). Generic renderer over the shared
// catalog; values persist as tenant settings keys (aura_tenant_settings).

export default function ModuleSettingsClient() {
  const [selected, setSelected] = useState(MODULE_SETTINGS_CATALOG[0]?.module ?? 'finance');
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ key: string; value: string }>) => {
        setValues(Object.fromEntries((Array.isArray(rows) ? rows : []).map((r) => [r.key, r.value])));
        setLoaded(true);
      })
      .catch(() => {
        setErr('Settings API unreachable.');
        setLoaded(true);
      });
  }, []);

  const group = MODULE_SETTINGS_CATALOG.find((g) => g.module === selected)!;
  const effective = (s: ModuleSettingSpec): string => values[s.key] ?? s.defaultValue ?? '';

  const edit = (key: string, value: string): void => {
    setValues({ ...values, [key]: value });
    setDirty(new Set([...dirty, key]));
    setMsg(null);
  };

  const save = async (): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      for (const g of MODULE_SETTINGS_CATALOG) {
        for (const s of g.settings) {
          if (!dirty.has(s.key)) continue;
          const res = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: s.key, value: values[s.key] ?? '', description: s.label }),
          });
          if (!res.ok) {
            setErr(`Failed to save ${s.key}`);
            return;
          }
        }
      }
      setDirty(new Set());
      setMsg('Saved — modules read these keys at runtime.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.ok}>{msg}</div>}

      <div style={st.bar}>
        <div style={st.tabs}>
          {MODULE_SETTINGS_CATALOG.map((g) => (
            <button key={g.module} style={{ ...st.tab, ...(g.module === selected ? st.tabOn : {}) }} onClick={() => setSelected(g.module)}>
              {g.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {dirty.size > 0 ? <Pill tone="warn">{dirty.size} unsaved</Pill> : <Pill tone="good">saved</Pill>}
        <button className="btn btn-primary" disabled={busy || dirty.size === 0} onClick={() => void save()}>
          Save settings
        </button>
      </div>

      <section style={st.card}>
        {!loaded ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {group.settings.map((s) => (
                <tr key={s.key}>
                  <td style={{ ...st.td, width: 280 }}>
                    <div style={{ fontWeight: 600 }}>{s.label} {s.consumed && <Pill tone="good">live</Pill>}</div>
                    {s.hint && <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>{s.hint}</div>}
                    <code style={st.code}>{s.key}</code>
                  </td>
                  <td style={st.td}>
                    {s.kind === 'toggle' ? (
                      <Toggle on={effective(s) === 'true'} disabled={busy} onChange={(next) => edit(s.key, String(next))} />
                    ) : s.kind === 'select' ? (
                      <select className="input" style={{ width: 180 }} value={effective(s)} onChange={(e) => edit(s.key, e.target.value)}>
                        {(s.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        className="input"
                        style={{ width: s.kind === 'csv' ? '100%' : 180 }}
                        inputMode={s.kind === 'number' ? 'decimal' : undefined}
                        value={effective(s)}
                        onChange={(e) => edit(s.key, e.target.value)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={st.hint}>
          <Pill tone="good">live</Pill> = a code path reads this key today; the rest are the
          published configuration surface modules adopt as they wire the settings seam.
        </p>
      </section>
    </div>
  );
}

const st = {
  bar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' } as CSSProperties,
  tabs: { display: 'inline-flex', gap: 4, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, flexWrap: 'wrap' } as CSSProperties,
  tab: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer' } as CSSProperties,
  tabOn: { background: 'var(--accent-grad)', color: 'var(--accent-ink)', fontWeight: 700 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  td: { padding: '10px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: 'var(--muted)' } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--muted)', margin: '12px 2px 0', lineHeight: 1.5 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', marginBottom: 14, fontSize: 13 } as CSSProperties,
};
