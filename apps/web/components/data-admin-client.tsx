'use client';

import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill } from './admin-ui';

// Data administration (Admin Center phase 2, Vol 15 §2.9): demo-data seed,
// CSV exports (the BI feeds), and chart-of-accounts CSV import.

export default function DataAdminClient() {
  const [err, setErr] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);

  const seed = async (): Promise<void> => {
    if (!window.confirm('Seed the demo company (accounts → tenders → contract → project + operate loop)? Idempotent — skipped if data exists.')) return;
    setErr(null);
    setSeedMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/seed-demo', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Seed failed');
        return;
      }
      setSeedMsg(d.seeded ? 'Demo company seeded — browse the deal chain from CRM → Projects.' : `Skipped: ${d.reason ?? 'already seeded'}.`);
    } finally {
      setBusy(false);
    }
  };

  const importAccounts = async (): Promise<void> => {
    setErr(null);
    setImportMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/finance/accounts/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Import failed');
        return;
      }
      setImportMsg(`Imported ${d.created ?? 0} account(s), skipped ${d.skipped ?? 0}${d.errors?.length ? `, ${d.errors.length} error(s): ${d.errors.slice(0, 3).join('; ')}` : ''}.`);
      if (d.created > 0) setCsv('');
    } finally {
      setBusy(false);
    }
  };

  const EXPORTS = [
    { label: 'Audit trail', href: '/api/audit/csv', desc: 'Immutable compliance log (filter on the Audit page)' },
    { label: 'AR aging', href: '/api/finance/ar-aging/csv', desc: 'Receivables bucketed by overdue age' },
    { label: 'AP aging', href: '/api/finance/ap-aging/csv', desc: 'Payables bucketed by invoice age' },
    { label: 'Supplier invoices', href: '/api/finance/invoices/csv', desc: 'Flat invoice register' },
  ];

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>

      {/* Demo seed */}
      <section style={st.card}>
        <h2 style={st.h2}>Demo data</h2>
        <p style={st.hint}>
          Seeds a complete demo company through the full deal chain (CRM accounts → tenders →
          contract → project → operate loop + HR/Quality inbox items). Idempotent — it refuses
          to run when the tenant already has data.
        </p>
        {seedMsg && <div style={st.ok}>{seedMsg}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={() => void seed()}>
          Seed demo company
        </button>
      </section>

      {/* Exports */}
      <section style={st.card}>
        <h2 style={st.h2}>CSV exports <Pill tone="info">BI feeds</Pill></h2>
        <p style={st.hint}>Excel / Power BI extracts — each downloads the live dataset.</p>
        {EXPORTS.map((e) => (
          <div key={e.href} style={st.exportRow}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{e.label}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{e.desc}</div>
            </div>
            <a className="btn" style={{ marginLeft: 'auto', fontSize: 12.5 }} href={e.href}>
              ⬇ Download
            </a>
          </div>
        ))}
      </section>

      {/* Accounts import */}
      <section style={st.card}>
        <h2 style={st.h2}>Import chart of accounts</h2>
        <p style={st.hint}>
          Paste CSV with columns <code style={st.code}>code,name,type[,parentId]</code> — types:
          asset, liability, equity, revenue, expense. Existing codes are skipped.
        </p>
        {importMsg && <div style={st.ok}>{importMsg}</div>}
        <textarea
          className="textarea"
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, minHeight: 120 }}
          placeholder={'code,name,type\n1000,Cash,asset\n4000,Contract Revenue,revenue'}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={busy || !csv.trim()} onClick={() => void importAccounts()}>
          Import accounts
        </button>
      </section>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14, background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  h2: { fontSize: 14.5, fontWeight: 700, margin: 0, display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  hint: { fontSize: 12.5, color: 'var(--muted)', margin: '5px 0 12px', lineHeight: 1.5 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 4px' } as CSSProperties,
  exportRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid var(--border)' } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', marginBottom: 12, fontSize: 13 } as CSSProperties,
};
