'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

// Module Manager (Admin Center). Toggle grid over the 17 business modules;
// enforcement is immediate: guard 403 + sidebar hide. Data is never touched.

interface ModuleState {
  id: string;
  label: string;
  glyph: string;
  desc: string;
  enabled: boolean;
}

export default function ModulesAdminClient() {
  const [modules, setModules] = useState<ModuleState[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/platform/modules', { cache: 'no-store' });
      if (!res.ok) {
        setErr('Could not load module states — is the API up?');
        return;
      }
      setModules(((await res.json()) as { modules: ModuleState[] }).modules);
    } catch {
      setErr('Platform API unreachable.');
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const toggle = async (m: ModuleState): Promise<void> => {
    if (m.enabled && !window.confirm(`Disable ${m.label}? Every user loses access immediately (navigation + API). Data is kept.`)) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/modules-toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: m.id, enabled: !m.enabled }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Toggle failed');
        return;
      }
      setMsg(`${m.label} ${m.enabled ? 'disabled — hidden from navigation, API rejects its routes' : 'enabled — back for everyone'}.`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (modules === null && !err) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>;

  const list = modules ?? [];
  const off = list.filter((m) => !m.enabled).length;

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.ok}>{msg}</div>}
      <section style={st.card}>
        <h2 style={st.h2}>
          Business modules <Pill tone="good">{list.length - off} on</Pill>
          {off > 0 && <Pill tone="bad">{off} off</Pill>}
        </h2>
        <div style={st.grid}>
          {list.map((m) => (
            <div key={m.id} style={{ ...st.tile, ...(m.enabled ? {} : { opacity: 0.55 }) }}>
              <div style={st.tileHead}>
                <span style={st.glyph}>{m.glyph}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.label}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>{m.desc}</div>
                </div>
                <Toggle on={m.enabled} disabled={busy} onChange={() => void toggle(m)} />
              </div>
            </div>
          ))}
        </div>
        <p style={st.hint}>
          Disabling never deletes data — records, events, and reports survive and return the
          moment the module is re-enabled. Kernel surfaces (admin, workspace, search, audit…)
          cannot be disabled.
        </p>
      </section>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  h2: { fontSize: 14.5, fontWeight: 700, margin: '0 0 12px', display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 } as CSSProperties,
  tile: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--panel-2)' } as CSSProperties,
  tileHead: { display: 'flex', alignItems: 'center', gap: 10 } as CSSProperties,
  glyph: { fontSize: 18, width: 28, textAlign: 'center' } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--muted)', margin: '12px 2px 0', lineHeight: 1.5 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', marginBottom: 14, fontSize: 13 } as CSSProperties,
};
