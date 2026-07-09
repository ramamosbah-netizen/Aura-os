'use client';

import React, { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { AdminHeader, AdminCard, type Kpi } from './admin-chrome';

export interface TenantSetting {
  key: string;
  value: string;
  description: string;
}

// Curated keys most tenants set first — one click prefills the editor with a
// sensible key + description so admins don't have to memorise the namespace.
const SUGGESTIONS: { key: string; description: string; placeholder: string }[] = [
  { key: 'company.name', description: 'Legal entity name shown on documents', placeholder: 'Gulf ELV Solutions LLC' },
  { key: 'company.trn', description: 'Tax registration number (TRN)', placeholder: '100xxxxxxxxxxxx' },
  { key: 'company.address', description: 'Registered office address', placeholder: 'Dubai, UAE' },
  { key: 'finance.defaultCurrency', description: 'ISO currency used for new documents', placeholder: 'AED' },
  { key: 'finance.vatRate', description: 'Default VAT percentage', placeholder: '5' },
  { key: 'finance.fiscalYearStart', description: 'Fiscal year start (MM-DD)', placeholder: '01-01' },
  { key: 'invoice.footer', description: 'Footer note printed on invoices', placeholder: 'Thank you for your business' },
  { key: 'invoice.paymentTerms', description: 'Default payment terms', placeholder: 'Net 30 Days' },
];

const namespaceOf = (key: string): string => {
  const i = key.indexOf('.');
  return i > 0 ? key.slice(0, i) : 'general';
};
const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export default function SettingsAdminClient({ initialSettings }: { initialSettings: TenantSetting[] }) {
  const [settings, setSettings] = useState<TenantSetting[]>(initialSettings);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

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

  const beginEdit = (s: TenantSetting): void => {
    setEditing(s.key);
    setKey(s.key);
    setValue(s.value);
    setDesc(s.description);
    setErr(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const prefill = (s: { key: string; description: string; placeholder: string }): void => {
    const existing = settings.find((x) => x.key === s.key);
    setEditing(existing ? s.key : null);
    setKey(s.key);
    setValue(existing?.value ?? '');
    setDesc(existing?.description || s.description);
    setErr(null);
  };

  const reset = (): void => {
    setEditing(null);
    setKey('');
    setValue('');
    setDesc('');
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
      reset();
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
      if (editing === k) reset();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => {
    const m = new Map<string, TenantSetting[]>();
    for (const s of [...settings].sort((a, b) => a.key.localeCompare(b.key))) {
      const ns = namespaceOf(s.key);
      const list = m.get(ns) ?? [];
      list.push(s);
      m.set(ns, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [settings]);

  const currency = settings.find((s) => s.key === 'finance.defaultCurrency')?.value;
  const company = settings.find((s) => s.key === 'company.name')?.value;

  const kpis: Kpi[] = [
    { label: 'Total Settings', value: settings.length, sub: 'key/value pairs', tone: 'accent' },
    { label: 'Namespaces', value: groups.length, sub: groups.map((g) => g[0]).slice(0, 3).join(', ') || '—' },
    { label: 'Company', value: company ? 'Set' : '—', sub: company || 'company.name', tone: company ? 'good' : undefined },
    { label: 'Currency', value: currency || '—', sub: 'finance.defaultCurrency', tone: currency ? 'good' : undefined },
  ];

  const suggestionsToShow = SUGGESTIONS.filter((s) => !settings.some((x) => x.key === s.key));

  return (
    <div>
      <AdminHeader
        title="Organisation Settings"
        glyph="⚙"
        backToHub
        subtitle="Per-tenant key/value configuration modules read to adapt behaviour — company identity, finance defaults, document text. Grouped by namespace."
        kpis={kpis}
      />

      {err && <div style={st.err}>{err}</div>}

      {/* Editor */}
      <AdminCard
        title={editing ? `Edit · ${editing}` : 'Add a setting'}
        desc="Keys use dot-namespaces (e.g. finance.defaultCurrency). Saving an existing key updates it."
        right={editing ? <button className="admin-rowbtn" onClick={reset}>Cancel edit</button> : undefined}
      >
        <form onSubmit={save} style={st.form}>
          <div style={st.formGrid}>
            <label style={st.field}>
              <span style={st.flabel}>Key</span>
              <input
                style={{ ...st.input, ...(editing ? st.inputLocked : {}) }}
                placeholder="finance.defaultCurrency"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                readOnly={!!editing}
                required
              />
            </label>
            <label style={st.field}>
              <span style={st.flabel}>Value</span>
              <input style={st.input} placeholder="AED" value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
          </div>
          <label style={st.field}>
            <span style={st.flabel}>Description <span style={st.opt}>(optional)</span></span>
            <input style={st.input} placeholder="What this setting controls" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <div style={st.formActions}>
            <button className="btn btn-primary" disabled={busy || !key.trim()} type="submit">
              {editing ? 'Update setting' : 'Save setting'}
            </button>
          </div>
        </form>

        {suggestionsToShow.length > 0 && (
          <div style={st.suggestWrap}>
            <div style={st.suggestLabel}>Quick add</div>
            <div style={st.suggestRow}>
              {suggestionsToShow.map((s) => (
                <button key={s.key} type="button" style={st.chip} onClick={() => prefill(s)}>
                  <span style={st.chipPlus}>+</span> {s.key}
                </button>
              ))}
            </div>
          </div>
        )}
      </AdminCard>

      {/* Grouped settings */}
      {settings.length === 0 ? (
        <AdminCard>
          <div style={st.empty}>
            <div style={st.emptyGlyph}>⚙</div>
            <div style={st.emptyTitle}>No settings configured yet</div>
            <div style={st.emptySub}>Use Quick add above to set your company identity and finance defaults.</div>
          </div>
        </AdminCard>
      ) : (
        groups.map(([ns, rows]) => (
          <AdminCard key={ns} title={titleCase(ns)} right={<span style={st.groupCount}>{rows.length}</span>}>
            <table style={st.table}>
              <thead>
                <tr>
                  <th style={st.th}>Key</th>
                  <th style={st.th}>Value</th>
                  <th style={st.th}>Description</th>
                  <th style={{ ...st.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.key} style={editing === s.key ? st.rowActive : undefined}>
                    <td style={st.tdMono}>{s.key}</td>
                    <td style={st.td}>{s.value || <span style={st.muted}>—</span>}</td>
                    <td style={{ ...st.td, color: 'var(--muted)' }}>{s.description || '—'}</td>
                    <td style={{ ...st.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="admin-rowbtn" disabled={busy} onClick={() => beginEdit(s)} style={st.mr}>Edit</button>
                      <button className="admin-rowbtn admin-rowbtn-danger" disabled={busy} onClick={() => remove(s.key)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminCard>
        ))
      )}
    </div>
  );
}

const st = {
  form: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  flabel: { fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' } as CSSProperties,
  opt: { fontWeight: 400, opacity: 0.7 } as CSSProperties,
  input: {
    width: '100%',
    padding: '9px 11px',
    border: '1px solid var(--border)',
    borderRadius: 9,
    background: 'var(--panel-2)',
    color: 'var(--text)',
    fontSize: 13.5,
    fontFamily: 'inherit',
  } as CSSProperties,
  inputLocked: { opacity: 0.7, fontFamily: 'ui-monospace, monospace', cursor: 'not-allowed' } as CSSProperties,
  formActions: { display: 'flex', justifyContent: 'flex-end', marginTop: 2 } as CSSProperties,
  suggestWrap: { marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' } as CSSProperties,
  suggestLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 9 } as CSSProperties,
  suggestRow: { display: 'flex', flexWrap: 'wrap', gap: 7 } as CSSProperties,
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 11px',
    border: '1px solid var(--border)',
    borderRadius: 999,
    background: 'var(--panel-2)',
    color: 'var(--text)',
    fontSize: 12,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
  } as CSSProperties,
  chipPlus: { color: 'var(--accent)', fontWeight: 800 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--muted)',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as CSSProperties,
  td: { padding: '10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  tdMono: { padding: '10px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, color: 'var(--accent)', verticalAlign: 'top' } as CSSProperties,
  rowActive: { background: 'var(--accent-soft)' } as CSSProperties,
  muted: { color: 'var(--muted)' } as CSSProperties,
  mr: { marginRight: 7 } as CSSProperties,
  groupCount: {
    fontSize: 12,
    fontWeight: 800,
    color: 'var(--accent)',
    background: 'var(--accent-soft)',
    borderRadius: 999,
    padding: '2px 10px',
  } as CSSProperties,
  empty: { textAlign: 'center', padding: '32px 16px' } as CSSProperties,
  emptyGlyph: { fontSize: 40, opacity: 0.3, marginBottom: 10 } as CSSProperties,
  emptyTitle: { fontSize: 15, fontWeight: 700, marginBottom: 5 } as CSSProperties,
  emptySub: { fontSize: 13, color: 'var(--muted)' } as CSSProperties,
  err: {
    padding: '11px 14px',
    border: '1px solid var(--bad)',
    borderRadius: 10,
    background: 'var(--bad-soft)',
    color: 'var(--bad)',
    marginBottom: 16,
    fontSize: 13,
  } as CSSProperties,
};
