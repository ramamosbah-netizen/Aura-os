'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ErrorBanner } from './admin-ui';

// Organization profile (Admin Center phase 2, Vol 15 §2.1) — a typed form over the
// tenant settings service. Each field maps to a well-known settings key; saving
// upserts only the fields that changed. Modules read these keys at runtime
// (documents print company.name/trn, finance defaults to the base currency, …).

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  kind?: 'text' | 'select';
  options?: string[];
  span?: 2;
}

const SECTIONS: { title: string; desc: string; fields: FieldDef[] }[] = [
  {
    title: 'Legal identity',
    desc: 'Printed on quotations, invoices, and statutory documents.',
    fields: [
      { key: 'company.name', label: 'Company name', placeholder: 'Gulf ELV Solutions LLC', span: 2 },
      { key: 'company.legalName', label: 'Legal name (if different)', placeholder: 'Gulf ELV Solutions L.L.C.', span: 2 },
      { key: 'company.trn', label: 'Tax registration number (TRN)', placeholder: '100XXXXXXXXXXXX' },
      { key: 'company.phone', label: 'Phone', placeholder: '+971 4 123 4567' },
      { key: 'company.email', label: 'Email', placeholder: 'info@company.ae' },
      { key: 'company.website', label: 'Website', placeholder: 'https://company.ae' },
      { key: 'company.address', label: 'Registered address', placeholder: 'Office 1204, Business Bay, Dubai, UAE', span: 2 },
    ],
  },
  {
    title: 'Finance defaults',
    desc: 'New documents inherit these unless overridden.',
    fields: [
      { key: 'finance.defaultCurrency', label: 'Base currency', placeholder: 'AED', kind: 'select', options: ['AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'USD', 'EUR'] },
      { key: 'finance.vatRate', label: 'Default VAT %', placeholder: '5' },
      { key: 'finance.fiscalYearStart', label: 'Fiscal year start (MM-DD)', placeholder: '01-01' },
      { key: 'finance.paymentTerms', label: 'Default payment terms', placeholder: 'Net 30 Days' },
    ],
  },
  {
    title: 'Locale & formats',
    desc: 'Display conventions across the workspace.',
    fields: [
      { key: 'locale.timezone', label: 'Timezone', placeholder: 'Asia/Dubai', kind: 'select', options: ['Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Muscat', 'Asia/Bahrain', 'UTC'] },
      { key: 'locale.dateFormat', label: 'Date format', placeholder: 'DD/MM/YYYY', kind: 'select', options: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] },
      { key: 'invoice.footer', label: 'Invoice footer note', placeholder: 'Thank you for your business', span: 2 },
    ],
  },
];

const DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f.label])),
);

export default function OrgProfileClient({ initial }: { initial: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirtyKeys = Object.keys(values).filter((k) => (values[k] ?? '') !== (saved[k] ?? ''));

  const set = (key: string, v: string): void => {
    setValues({ ...values, [key]: v });
    setMsg(null);
  };

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      for (const key of dirtyKeys) {
        const res = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, value: values[key] ?? '', description: DESCRIPTIONS[key] ?? '' }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setErr(d.message ?? d.error ?? `Failed to save ${key}`);
          return;
        }
      }
      setSaved({ ...values });
      setMsg(`Saved ${dirtyKeys.length} field(s).`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.ok}>{msg}</div>}

      {SECTIONS.map((sec) => (
        <section key={sec.title} style={st.card}>
          <h2 style={st.h2}>{sec.title}</h2>
          <p style={st.desc}>{sec.desc}</p>
          <div style={st.grid}>
            {sec.fields.map((f) => (
              <label key={f.key} style={{ ...st.field, ...(f.span === 2 ? { gridColumn: 'span 2' } : {}) }}>
                <span style={st.label}>{f.label}</span>
                {f.kind === 'select' ? (
                  <select className="select" value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">— {f.placeholder} —</option>
                    {f.options!.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    placeholder={f.placeholder}
                    value={values[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
                {f.hint ? <span style={st.hint}>{f.hint}</span> : null}
              </label>
            ))}
          </div>
        </section>
      ))}

      <div style={st.saveBar}>
        <span style={st.dirtyNote}>
          {dirtyKeys.length > 0 ? `${dirtyKeys.length} unsaved change(s)` : 'All changes saved'}
        </span>
        <button className="btn btn-primary" type="submit" disabled={busy || dirtyKeys.length === 0}>
          Save profile
        </button>
      </div>
    </form>
  );
}

const st = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    background: 'var(--panel)',
    boxShadow: 'var(--shadow-sm)',
  } as CSSProperties,
  h2: { fontSize: 14.5, fontWeight: 700, margin: 0 } as CSSProperties,
  desc: { fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 14px' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 } as CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text)' } as CSSProperties,
  hint: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  saveBar: {
    position: 'sticky',
    bottom: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 14,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '10px 14px',
    boxShadow: 'var(--shadow-lg)',
  } as CSSProperties,
  dirtyNote: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  ok: {
    padding: '10px 12px',
    border: '1px solid var(--good)',
    borderRadius: 10,
    background: 'var(--good-soft)',
    color: 'var(--good)',
    marginBottom: 14,
    fontSize: 13,
  } as CSSProperties,
};
