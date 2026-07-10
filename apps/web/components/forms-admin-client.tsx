'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

// Form Designer (Vol 15 §2.4). P1: per-field label/placeholder/hint/required/visible
// patches. P2: designer-added cf_* custom fields, ▲▼ reordering, and the draft→publish
// cycle — edits land in a DRAFT; the live form (renderer + API enforcement) only
// changes when the admin hits Publish, which bumps the version.

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
interface AddedField {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'date' | 'textarea';
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: string[];
}
interface Status {
  version: number;
  hasDraft: boolean;
  publishedAt: string | null;
}

const ADDED_KINDS: AddedField['kind'][] = ['text', 'number', 'select', 'date', 'textarea'];

export default function FormsAdminClient({ initialSchemas }: { initialSchemas: SchemaSummary[] }) {
  const [schemas, setSchemas] = useState<SchemaSummary[]>(initialSchemas);
  const [selected, setSelected] = useState<string | null>(initialSchemas[0]?.id ?? null);
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [patch, setPatch] = useState<Record<string, FieldOverride>>({});
  const [added, setAdded] = useState<AddedField[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ version: 1, hasDraft: false, publishedAt: null });
  const [composer, setComposer] = useState({ name: '', label: '', kind: 'text' as AddedField['kind'], required: false, options: '' });
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
    const code: SchemaField[] = d.schema?.fields ?? [];
    const adds: AddedField[] = d.overrides?.added ?? [];
    setFields(code);
    setPatch(d.overrides?.fields ?? {});
    setAdded(adds);
    // Materialize the full display order: stored order first, then any unlisted names.
    const stored: string[] = d.overrides?.order ?? [];
    const all = [...code.map((f) => f.name), ...adds.map((a) => a.name)];
    setOrder([...stored.filter((n) => all.includes(n)), ...all.filter((n) => !stored.includes(n))]);
    setStatus(d.status ?? { version: 1, hasDraft: false, publishedAt: null });
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

  const mark = (): void => {
    setDirty(true);
    setMsg(null);
  };

  /** The effective value of a designable prop (patch wins over the code schema). */
  const eff = <K extends keyof FieldOverride>(f: SchemaField, key: K): NonNullable<FieldOverride[K]> | string | boolean => {
    const o = patch[f.name]?.[key];
    if (o !== undefined) return o as NonNullable<FieldOverride[K]>;
    return (f[key as keyof SchemaField] as string | boolean | undefined) ?? (key === 'required' || key === 'hidden' ? false : '');
  };

  const setField = (name: string, p: Partial<FieldOverride>): void => {
    setPatch({ ...patch, [name]: { ...patch[name], ...p } });
    mark();
  };

  const setAddedField = (name: string, p: Partial<AddedField>): void => {
    setAdded(added.map((a) => (a.name === name ? { ...a, ...p } : a)));
    mark();
  };

  const move = (name: string, dir: -1 | 1): void => {
    const i = order.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    mark();
  };

  const addField = (): void => {
    const raw = composer.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const name = raw.startsWith('cf_') ? raw : `cf_${raw}`;
    if (!/^cf_[a-z0-9_]{1,40}$/.test(name)) {
      setErr('Field key must be letters/digits/underscores (it is stored as cf_<key>).');
      return;
    }
    if (fields.some((f) => f.name === name) || added.some((a) => a.name === name)) {
      setErr(`A field named ${name} already exists.`);
      return;
    }
    if (!composer.label.trim()) {
      setErr('The new field needs a label.');
      return;
    }
    const options = composer.options.split(',').map((s) => s.trim()).filter(Boolean);
    if (composer.kind === 'select' && options.length === 0) {
      setErr('A select field needs at least one option (comma-separated).');
      return;
    }
    setErr(null);
    setAdded([...added, {
      name,
      label: composer.label.trim(),
      kind: composer.kind,
      required: composer.required,
      ...(composer.kind === 'select' ? { options } : {}),
    }]);
    setOrder([...order, name]);
    setComposer({ name: '', label: '', kind: 'text', required: false, options: '' });
    mark();
  };

  const removeAdded = (name: string): void => {
    setAdded(added.filter((a) => a.name !== name));
    setOrder(order.filter((n) => n !== name));
    mark();
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!selected) return false;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/forms/${encodeURIComponent(selected)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: patch, added, order }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to save');
        return false;
      }
      setDirty(false);
      setStatus({ ...status, hasDraft: true });
      setMsg('Draft saved — the live form is unchanged until you publish.');
      return true;
    } finally {
      setBusy(false);
    }
  };

  const publish = async (): Promise<void> => {
    if (!selected) return;
    if (dirty && !(await saveDraft())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/forms/${encodeURIComponent(selected)}/publish`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Publish failed');
        return;
      }
      setMsg(`Published v${d.version} — new form opens render it, and the API enforces it.`);
      await load(selected);
      await refreshList();
    } finally {
      setBusy(false);
    }
  };

  const reset = async (): Promise<void> => {
    if (!selected || !window.confirm('Reset this form to its code defaults? Removes the published design AND the draft.')) return;
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

  // Display rows: code + added fields in the current order.
  const rowByName = new Map<string, { code?: SchemaField; add?: AddedField }>();
  for (const f of fields) rowByName.set(f.name, { code: f });
  for (const a of added) rowByName.set(a.name, { add: a });
  const rows = order.map((n) => ({ name: n, ...rowByName.get(n) })).filter((r) => r.code || r.add);

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
        <Pill tone="muted">v{status.version}</Pill>
        {dirty ? <Pill tone="warn">unsaved edits</Pill> : status.hasDraft ? <Pill tone="info">draft pending publish</Pill> : <Pill tone="good">live = published</Pill>}
        <button className="btn" disabled={busy} onClick={() => void reset()}>Reset to defaults</button>
        <button className="btn" disabled={busy || !dirty} onClick={() => void saveDraft()}>Save draft</button>
        <button className="btn btn-primary" disabled={busy || (!dirty && !status.hasDraft)} onClick={() => void publish()}>
          Publish{dirty ? ' (saves first)' : ''}
        </button>
      </div>

      <section style={st.card}>
        <div style={st.scroll}>
          <table className="adm-matrix" style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th style={{ width: 64 }}>Order</th>
                <th style={{ textAlign: 'left' }}>Field</th>
                <th style={{ textAlign: 'left' }}>Label</th>
                <th style={{ textAlign: 'left' }}>Placeholder</th>
                <th style={{ textAlign: 'left' }}>Hint</th>
                <th>Required</th>
                <th>Visible</th>
                <th style={{ width: 88 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const orderCell = (
                  <td>
                    <button className="btn btn-ghost" style={st.moveBtn} disabled={busy || i === 0} onClick={() => move(r.name, -1)}>▲</button>
                    <button className="btn btn-ghost" style={st.moveBtn} disabled={busy || i === rows.length - 1} onClick={() => move(r.name, 1)}>▼</button>
                  </td>
                );
                if (r.add) {
                  const a = r.add;
                  return (
                    <tr key={r.name} style={{ background: 'var(--panel-2)' }}>
                      {orderCell}
                      <td>
                        {a.name}
                        <span style={st.kind}>{a.kind}{a.options ? ` · ${a.options.join('/')}` : ''}</span>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input className="input" style={st.cellInput} value={a.label} onChange={(e) => setAddedField(a.name, { label: e.target.value })} />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input className="input" style={st.cellInput} value={a.placeholder ?? ''} onChange={(e) => setAddedField(a.name, { placeholder: e.target.value })} />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input className="input" style={st.cellInput} value={a.hint ?? ''} onChange={(e) => setAddedField(a.name, { hint: e.target.value })} />
                      </td>
                      <td><Toggle on={a.required === true} disabled={busy} onChange={(next) => setAddedField(a.name, { required: next })} /></td>
                      <td><Pill tone="info">custom</Pill></td>
                      <td>
                        <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--bad)' }} disabled={busy} onClick={() => removeAdded(a.name)}>Remove</button>
                      </td>
                    </tr>
                  );
                }
                const f = r.code!;
                const hidden = eff(f, 'hidden') === true;
                return (
                  <tr key={f.name} style={hidden ? { opacity: 0.55 } : undefined}>
                    {orderCell}
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

        {/* add-field composer (P2) */}
        <div style={st.composer}>
          <span style={{ fontWeight: 700, fontSize: 12.5 }}>+ Add field</span>
          <input className="input" style={{ width: 130 }} placeholder="key (cf_…)" value={composer.name}
            onChange={(e) => setComposer({ ...composer, name: e.target.value })} />
          <input className="input" style={{ width: 170 }} placeholder="label *" value={composer.label}
            onChange={(e) => setComposer({ ...composer, label: e.target.value })} />
          <select className="input" style={{ width: 110 }} value={composer.kind}
            onChange={(e) => setComposer({ ...composer, kind: e.target.value as AddedField['kind'] })}>
            {ADDED_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {composer.kind === 'select' && (
            <input className="input" style={{ width: 200 }} placeholder="options, comma-separated" value={composer.options}
              onChange={(e) => setComposer({ ...composer, options: e.target.value })} />
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <Toggle on={composer.required} disabled={busy} onChange={(next) => setComposer({ ...composer, required: next })} /> required
          </label>
          <button className="btn" disabled={busy || !composer.label.trim() || !composer.name.trim()} onClick={addField}>Add</button>
        </div>

        <p style={st.hint}>
          Edits save to a <b>draft</b>; the live form and API enforcement only change when you
          <b> publish</b> (version increments). Custom <code style={{ fontFamily: 'ui-monospace, monospace' }}>cf_*</code> fields
          render, validate, and their values persist per record. Hiding a field also removes its required check.
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
  moveBtn: { fontSize: 10, padding: '2px 6px' } as CSSProperties,
  composer: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12, padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 10 } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--muted)', margin: '10px 2px 0', lineHeight: 1.5 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', marginBottom: 14, fontSize: 13 } as CSSProperties,
};
