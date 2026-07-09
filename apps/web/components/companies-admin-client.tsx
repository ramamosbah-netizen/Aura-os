'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

// Companies master (Admin Center phase 2, Vol 15 §2.1) — inline-editable grid.
// Every document carries a company_id; the app-shell switcher reads this registry.

export interface Company {
  id: string;
  name: string;
  code: string;
  trn: string;
  baseCurrency: string;
  active: boolean;
}

const CURRENCIES = ['AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'USD', 'EUR'];

export default function CompaniesAdminClient({ initialCompanies }: { initialCompanies: Company[] }) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [drafts, setDrafts] = useState<Record<string, Company>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [nName, setNName] = useState('');
  const [nCode, setNCode] = useState('');

  const refresh = async (): Promise<void> => {
    const res = await fetch('/api/admin/companies', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setCompanies(d);
    }
  };

  const persist = async (c: Company): Promise<boolean> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(c),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to save company');
        return false;
      }
      await refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const draftOf = (c: Company): Company => drafts[c.id] ?? c;
  const isDirty = (c: Company): boolean => {
    const d = drafts[c.id];
    return !!d && JSON.stringify(d) !== JSON.stringify(c);
  };
  const patch = (c: Company, p: Partial<Company>): void => setDrafts({ ...drafts, [c.id]: { ...draftOf(c), ...p } });

  const saveRow = async (c: Company): Promise<void> => {
    if (await persist(draftOf(c))) {
      const next = { ...drafts };
      delete next[c.id];
      setDrafts(next);
    }
  };

  const remove = async (c: Company): Promise<void> => {
    if (!window.confirm(`Delete company "${c.name}"? Documents keep their company_id.`)) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/companies?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to delete');
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (
      await persist({
        id: '',
        name: nName.trim(),
        code: nCode.trim().toUpperCase(),
        trn: '',
        baseCurrency: 'AED',
        active: true,
      })
    ) {
      setNName('');
      setNCode('');
    }
  };

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>

      <div style={st.scroll}>
        <table className="adm-matrix" style={{ minWidth: 780 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Company</th>
              <th style={{ textAlign: 'left' }}>Code</th>
              <th style={{ textAlign: 'left' }}>TRN</th>
              <th>Currency</th>
              <th>Active</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr><td colSpan={6} style={st.empty}>No companies yet — add the first one below. The header switcher will pick them up.</td></tr>
            ) : (
              companies.map((c) => {
                const d = draftOf(c);
                return (
                  <tr key={c.id}>
                    <td style={{ textAlign: 'left' }}>
                      <input className="input" style={st.cellInput} value={d.name} onChange={(e) => patch(c, { name: e.target.value })} />
                      <span style={st.id}>{c.id}</span>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input className="input" style={{ ...st.cellInput, width: 90 }} value={d.code} onChange={(e) => patch(c, { code: e.target.value.toUpperCase() })} />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input className="input" style={{ ...st.cellInput, width: 150 }} placeholder="100…" value={d.trn} onChange={(e) => patch(c, { trn: e.target.value })} />
                    </td>
                    <td>
                      <select className="select" style={st.curSelect} value={d.baseCurrency} onChange={(e) => patch(c, { baseCurrency: e.target.value })}>
                        {CURRENCIES.map((cur) => <option key={cur} value={cur}>{cur}</option>)}
                      </select>
                    </td>
                    <td>
                      <Toggle on={d.active} disabled={busy} onChange={(next) => patch(c, { active: next })} />
                    </td>
                    <td>
                      {isDirty(c) ? (
                        <button className="btn btn-primary" style={st.smBtn} disabled={busy} onClick={() => void saveRow(c)}>Save</button>
                      ) : (
                        <Pill tone={c.active ? 'good' : 'muted'}>{c.active ? 'active' : 'inactive'}</Pill>
                      )}
                      <button className="btn btn-ghost" style={{ ...st.smBtn, color: 'var(--bad)', marginLeft: 6 }} disabled={busy} onClick={() => void remove(c)}>✕</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={add} style={st.form}>
        <input className="input" style={{ flex: 2, minWidth: 200 }} placeholder="company name (e.g. AURA MEP LLC)" value={nName} onChange={(e) => setNName(e.target.value)} required />
        <input className="input" style={{ width: 110 }} placeholder="code (MEP)" value={nCode} onChange={(e) => setNCode(e.target.value)} />
        <button className="btn btn-primary" disabled={busy} type="submit">Add company</button>
      </form>
    </div>
  );
}

const st = {
  scroll: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  empty: { color: 'var(--muted)', padding: 18 } as CSSProperties,
  cellInput: { padding: '5px 8px', fontSize: 12.5, borderRadius: 7, width: 200 } as CSSProperties,
  curSelect: { width: 84, padding: '4px 22px 4px 8px', fontSize: 12, borderRadius: 7, display: 'inline-block' } as CSSProperties,
  id: { display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  smBtn: { fontSize: 12, padding: '4px 10px' } as CSSProperties,
  form: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' } as CSSProperties,
};
