'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

// Form Designer P1 (Vol 15 §2.4) — per-form field grid. Edit labels, placeholders,
// hints, required flags, and visibility; the patch persists per tenant and is merged
// into BOTH the rendered form and the API's server-side validation.

interface SchemaSummary {
  id: string;
  entity: string;
  endpoint: string;
  fieldCount: number;
  overridden: number;
}
interface SchemaField {
  name: string;
  label: string;
  kind: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  hidden?: boolean;
  transient?: boolean;
}
interface FieldOverride {
  label?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  hidden?: boolean;
}

export default function FormsAdminClient({ initialSchemas }: { initialSchemas: SchemaSummary[] }) {
  const [schemas, setSchemas] = useState<SchemaSummary[]>(initialSchemas);
  const [selected, setSelected] = useState<string | null>(initialSchemas[0]?.id ?? null);
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [patch, setPatch] = useState<Record<string, FieldOverride>>({});
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (id: string): Promise<void> => {
    setErr(null);
    setMsg(null);
    const res = await fetch(`/api/admin/forms/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) {
      setErr('Failed to load form');
      return;
    }
    const d = await res.json();
    setFields(d.schema?.fields ?? []);
    setPatch(d.overrides?.fields ?? {});
    setDirty(false);
  };

  useEffect(() => {
    if (selected) void load(selected);
  }, [selected]);

  const refreshList = async (): Promise<void> => {
    const res = await fetch('/api/admin/forms', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setSchemas(d);
    }
  };

  /** The effective value of a designable prop (patch wins over the code schema). */
  const eff = <K extends keyof FieldOverride>(f: SchemaField, key: K): NonNullable<FieldOverride[K]> | string | boolean => {
    const o = patch[f.name]?.[key];
    if (o !== undefined) return o as NonNullable<FieldOverride[K]>;
    return (f[key as keyof SchemaField] as string | boolean | undefined) ?? (key === 'required' || key === 'hidden' ? false : '');
  };

  const setField = (name: string, p: Partial<FieldOverride>): void => {
    setPatch({ ...patch, [name]: { ...patch[name], ...p } });
    setDirty(true);
    setMsg(null);
  };

  const save = async (): Promise<void> => {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/forms/${encodeURIComponent(selected)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: patch }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to save');
        return;
      }
      setDirty(false);
      setMsg('Saved — new form opens with this design, and the API enforces it.');
      await refreshList();
    } finally {
      setBusy(false);
    }
  };

  const reset = async (): Promise<void> => {
    if (!selected || !window.confirm('Reset this form to its code defaults?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/forms/${encodeURIComponent(selected)}`, { method: 'DELETE' });
      if (!res.ok) {
        setErr('Failed to reset');
        return;
      }
      await load(selected);
      await refreshList();
      setMsg('Reset to code defaults.');
    } finally {
      setBusy(false);
    }
  };

  const isChanged = (f: SchemaField): boolean => Object.keys(patch[f.name] ?? {}).length > 0;

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.ok}>{msg}</div>}

      {/* form picker + actions */}
      <div style={st.bar}>
        <div style={st.tabs}>
          {schemas.map((s) => (
            <button key={s.id} style={{ ...st.tab, ...(s.id === selected ? st.tabOn : {}) }} onClick={() => setSelected(s.id)}>
              {s.entity}
              {s.overridden > 0 && <span style={st.tabBadge}>{s.overridden}</span>}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {dirty ? <Pill tone="warn">unsaved changes</Pill> : <Pill tone="good">saved</Pill>}
        <button className="btn" disabled={busy} onClick={() => void reset()}>Reset to defaults</button>
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>Save design</button>
      </div>

      <section style={st.card}>
        <div style={st.scroll}>
          <table className="adm-matrix" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Field</th>
                <th style={{ textAlign: 'left' }}>Label</th>
                <th style={{ textAlign: 'left' }}>Placeholder</th>
                <th style={{ textAlign: 'left' }}>Hint</th>
                <th>Required</th>
                <th>Visible</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const hidden = eff(f, 'hidden') === true;
                return (
                  <tr key={f.name} style={hidden ? { opacity: 0.55 } : undefined}>
                    <td>
                      {f.name}
                      <span style={st.kind}>{f.kind}{f.transient ? ' · computed' : ''}</span>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input className="input" style={st.cellInput} value={String(eff(f, 'label'))}
                        onChange={(e) => setField(f.name, { label: e.target.value })} />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input className="input" style={st.cellInput} value={String(eff(f, 'placeholder'))}
                        onChange={(e) => setField(f.name, { placeholder: e.target.value })} />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input className="input" style={st.cellInput} value={String(eff(f, 'hint'))}
                        onChange={(e) => setField(f.name, { hint: e.target.value })} />
                    </td>
                    <td>
                      <Toggle on={eff(f, 'required') === true} disabled={busy || hidden || !!f.transient}
                        onChange={(next) => setField(f.name, { required: next })} title={hidden ? 'Hidden fields cannot be required' : undefined} />
                    </td>
                    <td>
                      <Toggle on={!hidden} disabled={busy} onChange={(next) => setField(f.name, { hidden: !next })} />
                    </td>
                    <td>{isChanged(f) ? <Pill tone="info">edited</Pill> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={st.hint}>
          Changes apply to <b>new form opens</b> after saving and are enforced by the API on submit —
          hiding a field also removes its required check. Reset returns the form to its code schema.
        </p>
      </section>
    </div>
  );
}

const st = {
  bar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' } as CSSProperties,
  tabs: { display: 'inline-flex', gap: 4, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 } as CSSProperties,
  tab: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as CSSProperties,
  tabOn: { background: 'var(--accent-grad)', color: 'var(--accent-ink)', fontWeight: 700 } as CSSProperties,
  tabBadge: { fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.18)', borderRadius: 999, padding: '1px 6px' } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  scroll: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  kind: { display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  cellInput: { padding: '5px 8px', fontSize: 12.5, borderRadius: 7, minWidth: 140, width: '100%' } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--muted)', margin: '10px 2px 0', lineHeight: 1.5 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', marginBottom: 14, fontSize: 13 } as CSSProperties,
};
