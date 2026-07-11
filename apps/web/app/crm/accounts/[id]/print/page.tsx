'use client';

import { use, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

// Customer dossier — A4 print sheet (browser print-to-PDF, the platform's
// document pattern). Everything the Account 360 knows, print-formatted.

interface Payload {
  account: {
    name: string; status: string; industry: string | null; website: string | null;
    phone: string | null; email: string | null; billingAddress: string | null;
    source: string | null; paymentTerms: string | null; ownerId: string | null; createdAt: string;
  };
  contacts: Array<{ name: string; email?: string | null; phone?: string | null; createdAt: string }>;
  opportunities: Array<{ title: string; stage: string; value: number; winProbability: number; createdAt: string }>;
  tenders: Array<{ title: string; reference: string | null; status: string; value: number; createdAt: string }>;
  quotations: Array<{ quoteNumber: string; status: string; total: number; issueDate: string }>;
  contracts: Array<{ title: string; status: string; value: number; createdAt: string }>;
  projects: Array<{ title: string; status: string; createdAt: string }>;
  receivables: { invoiced: number; paid: number; outstanding: number; overdue: number; invoiceCount: number };
  summary: { pipelineValue: number; wonValue: number; outstandingReceivables: number; health: string };
  timeline: Array<{ at: string; kind: string; label: string }>;
}

const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2 }).format(n);
const d = (iso: string): string => new Date(iso).toLocaleDateString('en-GB');

export default function AccountDossierPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<Payload | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/crm/accounts/${id}/summary`, { cache: 'no-store' });
      if (res.ok) setP(await res.json());
    })();
  }, [id]);

  if (!p) return <p style={{ padding: 24, color: '#666' }}>Preparing dossier…</p>;
  const a = p.account;

  return (
    <div style={s.wrap}>
      <style>{PRINT_CSS}</style>
      <div className="no-print" style={s.toolbar}>
        <button type="button" style={s.printBtn} onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <button type="button" style={s.backBtn} onClick={() => window.history.back()}>← Back</button>
      </div>

      <div className="sheet" style={s.sheet}>
        <header style={s.header}>
          <div>
            <div style={s.company}>AURA OS Contracting LLC</div>
            <div style={s.companyMeta}>Dubai, United Arab Emirates · TRN 100000000000003</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={s.kind}>CUSTOMER DOSSIER</div>
            <div style={s.ref}>{a.name}</div>
            <div style={s.statusChip}>{a.status} · {p.summary.health}</div>
          </div>
        </header>

        <Section title="Profile">
          <div style={s.profileGrid}>
            <KV k="Industry" v={a.industry} />
            <KV k="Website" v={a.website} />
            <KV k="Phone" v={a.phone} />
            <KV k="Email" v={a.email} />
            <KV k="Billing address" v={a.billingAddress} wide />
            <KV k="Source" v={a.source} />
            <KV k="Payment terms" v={a.paymentTerms} />
            <KV k="Account owner" v={a.ownerId} />
            <KV k="Client since" v={d(a.createdAt)} />
          </div>
        </Section>

        <Section title="Commercial summary">
          <div style={s.statRow}>
            <KV k="Pipeline value" v={`AED ${aed(p.summary.pipelineValue)}`} />
            <KV k="Won value (contracts)" v={`AED ${aed(p.summary.wonValue)}`} />
            <KV k="Invoiced" v={`AED ${aed(p.receivables.invoiced)}`} />
            <KV k="Collected" v={`AED ${aed(p.receivables.paid)}`} />
            <KV k="Outstanding" v={`AED ${aed(p.receivables.outstanding)}`} />
            <KV k="Overdue" v={`AED ${aed(p.receivables.overdue)}`} />
          </div>
        </Section>

        <TableSection title={`Contacts (${p.contacts.length})`} cols={['Name', 'Email', 'Phone', 'Added']}
          rows={p.contacts.map((c) => [c.name, c.email ?? '—', c.phone ?? '—', d(c.createdAt)])} />
        <TableSection title={`Opportunities (${p.opportunities.length})`} cols={['Title', 'Stage', 'Value (AED)', 'Win %', 'Created']}
          rows={p.opportunities.map((o) => [o.title, o.stage, aed(o.value), `${o.winProbability}%`, d(o.createdAt)])} />
        <TableSection title={`Tenders (${p.tenders.length})`} cols={['Title', 'Reference', 'Status', 'Value (AED)', 'Created']}
          rows={p.tenders.map((t) => [t.title, t.reference ?? '—', t.status, aed(t.value), d(t.createdAt)])} />
        <TableSection title={`Quotations (${p.quotations.length})`} cols={['Number', 'Status', 'Total (AED)', 'Issued']}
          rows={p.quotations.map((q) => [q.quoteNumber, q.status, aed(q.total), d(q.issueDate)])} />
        <TableSection title={`Contracts (${p.contracts.length})`} cols={['Title', 'Status', 'Value (AED)', 'Awarded']}
          rows={p.contracts.map((c) => [c.title, c.status, aed(c.value), d(c.createdAt)])} />
        <TableSection title={`Projects (${p.projects.length})`} cols={['Title', 'Status', 'Started']}
          rows={p.projects.map((pr) => [pr.title, pr.status, d(pr.createdAt)])} />
        <TableSection title="Timeline" cols={['Date', 'Event']}
          rows={p.timeline.map((t) => [d(t.at), t.label])} />

        <footer style={s.footer}>Generated by AURA OS · {new Date().toLocaleString('en-GB')} · INTERNAL</footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <div style={s.sectionTitle}>{title}</div>
      {children}
    </section>
  );
}

function KV({ k, v, wide }: { k: string; v: string | null; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: 'span 2' } : undefined}>
      <div style={s.kvLabel}>{k}</div>
      <div style={s.kvValue}>{v ?? '—'}</div>
    </div>
  );
}

function TableSection({ title, cols, rows }: { title: string; cols: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <Section title={title}>
      <table style={s.table}>
        <thead>
          <tr>{cols.map((c, i) => <th key={i} style={s.th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((cell, j) => <td key={j} style={s.td}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; }
  .sheet { box-shadow: none !important; margin: 0 !important; border: none !important; }
}
`;

const s = {
  wrap: { maxWidth: 820, margin: '0 auto', padding: 16 } as CSSProperties,
  toolbar: { display: 'flex', gap: 8, marginBottom: 12 } as CSSProperties,
  printBtn: { background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  backBtn: { background: 'transparent', border: '1px solid var(--border, #d0d5dd)', borderRadius: 8, padding: '9px 14px', fontSize: 13.5, cursor: 'pointer', color: 'var(--text, #111)' } as CSSProperties,
  sheet: { background: '#fff', color: '#111', border: '1px solid #e5e7eb', borderRadius: 4, padding: '28px 32px', boxShadow: '0 1px 8px rgba(0,0,0,0.08)', fontSize: 12.5 } as CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 18 } as CSSProperties,
  company: { fontSize: 18, fontWeight: 700 } as CSSProperties,
  companyMeta: { fontSize: 11, color: '#555', marginTop: 3 } as CSSProperties,
  kind: { fontSize: 15, fontWeight: 700, letterSpacing: 0.5 } as CSSProperties,
  ref: { fontSize: 14, fontWeight: 600, marginTop: 2 } as CSSProperties,
  statusChip: { display: 'inline-block', marginTop: 4, fontSize: 10.5, textTransform: 'uppercase', border: '1px solid #111', borderRadius: 999, padding: '1px 8px' } as CSSProperties,
  sectionTitle: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7, color: '#333', borderBottom: '1px solid #ddd', paddingBottom: 4, marginBottom: 8 } as CSSProperties,
  profileGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 20px' } as CSSProperties,
  statRow: { display: 'flex', gap: 26, flexWrap: 'wrap' } as CSSProperties,
  kvLabel: { fontSize: 9.5, textTransform: 'uppercase', color: '#888' } as CSSProperties,
  kvValue: { fontSize: 12, fontWeight: 500 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 } as CSSProperties,
  th: { textAlign: 'left', borderBottom: '1.5px solid #111', padding: '5px 7px', fontSize: 10, textTransform: 'uppercase', color: '#333' } as CSSProperties,
  td: { padding: '5px 7px', borderBottom: '1px solid #eee' } as CSSProperties,
  footer: { marginTop: 24, paddingTop: 10, borderTop: '1px solid #eee', fontSize: 10, color: '#999', textAlign: 'center' } as CSSProperties,
};
