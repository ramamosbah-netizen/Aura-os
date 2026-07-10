'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill } from './admin-ui';

// Data administration (Admin Center phase 2, Vol 15 §2.9): demo-data seed,
// CSV exports (the BI feeds), chart-of-accounts CSV import, and the data-lifecycle
// surface (orphan-scan report + retention/archiver, gap #25 made admin-visible).

interface LifecycleStatus {
  database: boolean;
  months: number;
  orphans: Array<{ child: string; column: string; parent: string; count: number | null }>;
  archive: Array<{ table: string; eligible: number; archived: number }>;
}

export default function DataAdminClient() {
  const [err, setErr] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [life, setLife] = useState<LifecycleStatus | null>(null);
  const [months, setMonths] = useState('12');
  const [lifeMsg, setLifeMsg] = useState<string | null>(null);

  const loadLifecycle = async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/platform/data-lifecycle', { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as LifecycleStatus;
      setLife(d);
      setMonths(String(d.months));
    } catch {
      /* API offline — the section shows its offline hint */
    }
  };
  useEffect(() => {
    void loadLifecycle();
  }, []);

  const saveMonths = async (): Promise<void> => {
    const n = Number(months);
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      setErr('Retention window must be a whole number of months between 1 and 120.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'lifecycle.archiveMonths', value: String(n) }),
      });
      if (!res.ok) {
        setErr('Could not save the retention window.');
        return;
      }
      setLifeMsg(`Retention window saved: rows older than ${n} months are archive-eligible.`);
      await loadLifecycle();
    } finally {
      setBusy(false);
    }
  };

  const runArchive = async (execute: boolean): Promise<void> => {
    if (execute && !window.confirm('Move all archive-eligible event/audit rows into their *_archive twins? Processed events and audit entries only — pending outbox rows never move.')) return;
    setErr(null);
    setLifeMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/archive-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ execute }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Archiver failed');
        return;
      }
      const parts = (d.results as Array<{ table: string; eligible: number; moved: number }>).map(
        (r) => `${r.table}: ${execute ? `${r.moved} moved` : `${r.eligible} eligible`}`,
      );
      setLifeMsg(`${execute ? 'Archive run complete' : 'Dry run'} (older than ${d.months} months) — ${parts.join(' · ')}.`);
      await loadLifecycle();
    } finally {
      setBusy(false);
    }
  };

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

      {/* Data lifecycle — orphan report + retention/archiver (gap #25, Vol 15 §2.9/§2.6) */}
      <section style={st.card}>
        <h2 style={st.h2}>
          Data lifecycle <Pill tone={life?.orphans.some((o) => (o.count ?? 0) > 0) ? 'bad' : 'good'}>{life ? (life.orphans.some((o) => (o.count ?? 0) > 0) ? 'orphans found' : 'healthy') : '…'}</Pill>
        </h2>
        <p style={st.hint}>
          Referential health across module boundaries (the schema links contexts by id snapshot,
          not FK) and cold-storage archiving for the event spine + audit trail. Same checks CI
          runs; details in <code style={st.code}>docs/runbooks/data-lifecycle.md</code>.
        </p>
        {lifeMsg && <div style={st.ok}>{lifeMsg}</div>}
        {!life || !life.database ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            {life ? 'No database configured (in-memory mode) — lifecycle tooling applies to Postgres deployments.' : 'Loading…'}
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 12.5, margin: '6px 0 4px' }}>Orphan scan — cross-context references</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={st.th}>Reference</th>
                  <th style={st.th}>Parent</th>
                  <th style={{ ...st.th, textAlign: 'right' }}>Orphans</th>
                </tr>
              </thead>
              <tbody>
                {life.orphans.map((o) => (
                  <tr key={`${o.child}.${o.column}`}>
                    <td style={st.td}><code style={st.code}>{o.child}.{o.column}</code></td>
                    <td style={st.td}><code style={st.code}>{o.parent}</code></td>
                    <td style={{ ...st.td, textAlign: 'right' }}>
                      {o.count === null ? <Pill tone="info">table missing</Pill> : o.count === 0 ? <Pill tone="good">0</Pill> : <Pill tone="bad">{o.count}</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontWeight: 700, fontSize: 12.5, margin: '16px 0 4px' }}>Archiving — event spine &amp; audit trail</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 10px', fontSize: 12.5 }}>
              <span>Archive rows older than</span>
              <input
                className="input"
                style={{ width: 64, textAlign: 'center' }}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                inputMode="numeric"
              />
              <span>months</span>
              <button className="btn" style={{ fontSize: 12 }} disabled={busy || Number(months) === life.months} onClick={() => void saveMonths()}>
                Save window
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={st.th}>Table</th>
                  <th style={{ ...st.th, textAlign: 'right' }}>Eligible now</th>
                  <th style={{ ...st.th, textAlign: 'right' }}>Already archived</th>
                </tr>
              </thead>
              <tbody>
                {life.archive.map((a) => (
                  <tr key={a.table}>
                    <td style={st.td}><code style={st.code}>{a.table}</code>{a.table === 'aura_events' ? <span style={{ color: 'var(--muted)', fontSize: 11.5 }}> (processed only)</span> : null}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{a.eligible}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{a.archived}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn" disabled={busy} onClick={() => void runArchive(false)}>
                Dry run
              </button>
              <button className="btn btn-primary" disabled={busy || life.archive.every((a) => a.eligible === 0)} onClick={() => void runArchive(true)}>
                Archive eligible rows
              </button>
            </div>
          </>
        )}
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
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '6px 8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', marginBottom: 12, fontSize: 13 } as CSSProperties,
};
