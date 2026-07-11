'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

// Account 360 — the customer command center. The Account is the PERSISTENT
// commercial party at the head of the deal chain; opportunities, tenders,
// quotations, contracts and projects are the transactions that flow through it.
// Header → profile → commercial summary → deal-chain strip → tabbed records → timeline.

interface Account {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  source: string | null;
  paymentTerms: string | null;
  ownerId: string | null;
  createdAt: string;
}
interface Contact { id: string; name: string; role?: string | null; email?: string | null; phone?: string | null; status?: string; createdAt: string }
interface Opportunity { id: string; title: string; value: number; stage: string; winProbability: number; closeDate: string | null; createdAt: string }
interface TenderRec { id: string; title: string; reference: string | null; status: string; value: number; createdAt: string }
interface QuotationRec { id: string; quoteNumber: string; status: string; total: number; issueDate: string; sourceTenderId?: string | null }
interface ContractRec { id: string; title: string; reference?: string | null; status: string; value: number; createdAt: string }
interface ProjectRec { id: string; title: string; status: string; createdAt: string }
interface ActivityRec { id: string; type: string; subject: string; status: string; dueDate: string | null; createdAt: string }
interface TimelineEntry { at: string; kind: string; label: string; href: string | null }

interface Payload {
  account: Account;
  contacts: Contact[];
  opportunities: Opportunity[];
  tenders: TenderRec[];
  quotations: QuotationRec[];
  contracts: ContractRec[];
  projects: ProjectRec[];
  activities: ActivityRec[];
  receivables: { invoiced: number; paid: number; outstanding: number; overdue: number; invoiceCount: number };
  summary: {
    pipelineValue: number;
    activeOpportunities: number;
    tenderCount: number;
    openTenders: number;
    quotationCount: number;
    contractCount: number;
    projectCount: number;
    wonValue: number;
    outstandingReceivables: number;
    health: 'new' | 'good' | 'watch';
  };
  timeline: TimelineEntry[];
}

type Tab = 'overview' | 'contacts' | 'opportunities' | 'tenders' | 'quotations' | 'contracts' | 'projects' | 'activities' | 'financials' | 'timeline';

const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2 }).format(n);
const d = (iso: string): string => new Date(iso).toLocaleDateString();

const HEALTH: Record<string, { label: string; color: string }> = {
  new: { label: 'New relationship', color: 'var(--muted)' },
  good: { label: 'Healthy', color: 'var(--good)' },
  watch: { label: 'Watch — overdue AR', color: 'var(--warn, #d97706)' },
};

const KIND_GLYPH: Record<string, string> = {
  account: '◆', contact: '☎', opportunity: '◎', tender: '◳', quotation: '✎', contract: '▤', project: '▦', invoice: '¤',
};

export default function Account360Client({ accountId }: { accountId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/accounts/${accountId}/summary`, { cache: 'no-store' });
    if (!res.ok) {
      setErr('Failed to load the account');
      return;
    }
    setData(await res.json());
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p style={{ color: 'var(--muted)' }}>{err ?? 'Loading account…'}</p>;

  const { account: a, contacts, opportunities, tenders, quotations, contracts, projects, activities, receivables, summary, timeline } = data;
  const mainContact = contacts[0] ?? null;
  const health = HEALTH[summary.health];

  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: 'Contacts', count: contacts.length },
    { id: 'opportunities', label: 'Opportunities', count: opportunities.length },
    { id: 'tenders', label: 'Tenders', count: tenders.length },
    { id: 'quotations', label: 'Quotations', count: quotations.length },
    { id: 'contracts', label: 'Contracts', count: contracts.length },
    { id: 'projects', label: 'Projects', count: projects.length },
    { id: 'activities', label: 'Activities', count: activities.length },
    { id: 'financials', label: 'Financials', count: receivables.invoiceCount },
    { id: 'timeline', label: 'Timeline' },
  ];

  const chain: Array<{ label: string; count: number; value?: number; href: string }> = [
    { label: 'Opportunities', count: opportunities.length, value: summary.pipelineValue, href: '/crm/leads' },
    { label: 'Tenders', count: tenders.length, href: '/tendering/tenders' },
    { label: 'Quotations', count: quotations.length, href: '/crm/quotations' },
    { label: 'Contracts', count: contracts.length, value: summary.wonValue, href: '/contracts/contracts' },
    { label: 'Projects', count: projects.length, href: '/projects/projects' },
  ];

  return (
    <div>
      {/* header */}
      <div style={st.header}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={st.h1}>{a.name}</h1>
            <span style={st.statusPill}>{a.status}</span>
            <span style={{ ...st.healthPill, color: health.color, borderColor: 'currentColor' }}>● {health.label}</span>
          </div>
          <div style={st.subline}>
            {a.industry && <span>{a.industry}</span>}
            {a.ownerId && <span>Owner: {a.ownerId}</span>}
            <span>Client since {d(a.createdAt)}</span>
            {a.source && <span>Source: {a.source}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/crm/quotations" style={st.actionBtn}>+ Quotation</a>
          <a href="/tendering/tenders" style={st.actionBtn}>+ Tender</a>
          <a href="/crm/contacts" style={st.actionBtn}>+ Contact</a>
          <a href={`/api/crm/accounts/${a.id}/dossier/xlsx`} style={st.actionBtn}>⤓ Excel</a>
          <a href={`/crm/accounts/${a.id}/print`} style={st.actionBtn}>🖨 PDF</a>
        </div>
      </div>

      {/* commercial summary */}
      <div style={st.stats}>
        <Stat label="Pipeline value" value={`AED ${aed(summary.pipelineValue)}`} />
        <Stat label="Active opportunities" value={String(summary.activeOpportunities)} />
        <Stat label="Tenders" value={`${summary.openTenders} open / ${summary.tenderCount}`} />
        <Stat label="Quotations" value={String(summary.quotationCount)} />
        <Stat label="Contracts" value={String(summary.contractCount)} />
        <Stat label="Won value" value={`AED ${aed(summary.wonValue)}`} strong accent />
        <Stat label="Projects" value={String(summary.projectCount)} />
        <Stat
          label="Outstanding AR"
          value={`AED ${aed(summary.outstandingReceivables)}`}
          strong
          tone={receivables.overdue > 0 ? 'bad' : undefined}
        />
      </div>

      {/* deal-chain strip */}
      <div style={st.chain}>
        <span style={st.chainAccount}>◆ {a.name}</span>
        {chain.map((c) => (
          <span key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)' }}>→</span>
            <a href={c.href} style={{ ...st.chainNode, ...(c.count > 0 ? st.chainNodeActive : {}) }}>
              {c.label} <b>{c.count}</b>
              {c.value !== undefined && c.value > 0 && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {aed(c.value)}</span>}
            </a>
          </span>
        ))}
      </div>

      {/* tabs */}
      <div style={st.tabs}>
        {TABS.map((t) => (
          <button key={t.id} style={{ ...st.tab, ...(tab === t.id ? st.tabOn : {}) }} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count !== undefined && t.count > 0 && <span style={st.tabCount}>{t.count}</span>}
          </button>
        ))}
      </div>

      <section style={st.card}>
        {tab === 'overview' && (
          <div style={st.overviewGrid}>
            <Info label="Industry" value={a.industry} />
            <Info label="Website" value={a.website} link />
            <Info label="Main contact" value={mainContact ? `${mainContact.name}${mainContact.email ? ` · ${mainContact.email}` : ''}` : null} />
            <Info label="Phone" value={a.phone ?? mainContact?.phone ?? null} />
            <Info label="Email" value={a.email ?? mainContact?.email ?? null} />
            <Info label="Billing address" value={a.billingAddress} wide />
            <Info label="Account owner" value={a.ownerId} />
            <Info label="Source" value={a.source} />
            <Info label="Client since" value={d(a.createdAt)} />
            <Info label="Credit / payment terms" value={a.paymentTerms} />
          </div>
        )}

        {tab === 'contacts' && (
          <Table
            cols={['Name', 'Role', 'Email', 'Phone', 'Added']}
            rows={contacts.map((c) => [c.name, c.role ?? '—', c.email ?? '—', c.phone ?? '—', d(c.createdAt)])}
            empty="No contacts yet — add the people you deal with at this client."
          />
        )}

        {tab === 'opportunities' && (
          <Table
            cols={['Title', 'Stage', 'Value', 'Win %', 'Close date', 'Created']}
            rows={opportunities.map((o) => [o.title, <Pill key="s" text={o.stage} />, `AED ${aed(o.value)}`, `${o.winProbability}%`, o.closeDate ? d(o.closeDate) : '—', d(o.createdAt)])}
            empty="No opportunities yet."
          />
        )}

        {tab === 'tenders' && (
          <Table
            cols={['Tender', 'Reference', 'Status', 'Value', 'Created', '']}
            rows={tenders.map((t) => [
              t.title,
              t.reference ?? '—',
              <Pill key="s" text={t.status} />,
              `AED ${aed(t.value)}`,
              d(t.createdAt),
              <a key="a" href={`/tendering/tenders/${t.id}`} style={st.rowLink}>Open →</a>,
            ])}
            empty="No tenders for this client yet."
          />
        )}

        {tab === 'quotations' && (
          <Table
            cols={['Number', 'Status', 'Total', 'Issued', '']}
            rows={quotations.map((q) => [
              q.quoteNumber,
              <Pill key="s" text={q.status} />,
              `AED ${aed(q.total)}`,
              d(q.issueDate),
              <a key="a" href="/crm/quotations" style={st.rowLink}>Open →</a>,
            ])}
            empty="No quotations issued to this client yet."
          />
        )}

        {tab === 'contracts' && (
          <Table
            cols={['Contract', 'Status', 'Value', 'Awarded', '']}
            rows={contracts.map((c) => [
              c.title,
              <Pill key="s" text={c.status} />,
              `AED ${aed(c.value)}`,
              d(c.createdAt),
              <a key="a" href={`/contracts/contracts/${c.id}`} style={st.rowLink}>Open →</a>,
            ])}
            empty="No contracts awarded yet."
          />
        )}

        {tab === 'projects' && (
          <Table
            cols={['Project', 'Status', 'Started', '']}
            rows={projects.map((p) => [
              p.title,
              <Pill key="s" text={p.status} />,
              d(p.createdAt),
              <a key="a" href={`/projects/projects/${p.id}`} style={st.rowLink}>Open →</a>,
            ])}
            empty="No projects for this client yet."
          />
        )}

        {tab === 'activities' && (
          <Table
            cols={['Type', 'Subject', 'Status', 'Due', 'Logged']}
            rows={activities.map((x) => [x.type, x.subject, <Pill key="s" text={x.status} />, x.dueDate ? d(x.dueDate) : '—', d(x.createdAt)])}
            empty="No activities logged against this account."
          />
        )}

        {tab === 'financials' && (
          <div>
            <div style={{ ...st.stats, marginBottom: 16 }}>
              <Stat label="Invoiced" value={`AED ${aed(receivables.invoiced)}`} />
              <Stat label="Collected" value={`AED ${aed(receivables.paid)}`} />
              <Stat label="Outstanding" value={`AED ${aed(receivables.outstanding)}`} strong />
              <Stat label="Overdue" value={`AED ${aed(receivables.overdue)}`} strong tone={receivables.overdue > 0 ? 'bad' : undefined} />
              <Stat label="Invoices" value={String(receivables.invoiceCount)} />
              <Stat label="Payment terms" value={a.paymentTerms ?? '—'} />
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
              Receivables match customer invoices issued to “{a.name}”. Full ledger: <a href="/finance/ar" style={st.rowLink}>Accounts receivable →</a>
            </p>
          </div>
        )}

        {tab === 'timeline' && (
          <div>
            {timeline.length === 0 && <p style={{ color: 'var(--muted)' }}>Nothing yet.</p>}
            {timeline.map((t, i) => (
              <div key={i} style={st.tlRow}>
                <span style={st.tlGlyph}>{KIND_GLYPH[t.kind] ?? '·'}</span>
                <span style={st.tlDate}>{d(t.at)}</span>
                {t.href ? <a href={t.href} style={{ ...st.tlLabel, color: 'var(--fg)', textDecoration: 'none' }}>{t.label}</a> : <span style={st.tlLabel}>{t.label}</span>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, strong, accent, tone }: { label: string; value: string; strong?: boolean; accent?: boolean; tone?: 'bad' }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: strong ? 16 : 14, fontWeight: strong ? 800 : 600, color: tone === 'bad' ? 'var(--bad)' : accent ? 'var(--accent)' : 'var(--fg)' }}>{value}</div>
    </div>
  );
}

function Info({ label, value, wide, link }: { label: string; value: string | null; wide?: boolean; link?: boolean }) {
  return (
    <div style={wide ? { gridColumn: 'span 2' } : undefined}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5 }}>
        {value ? (link ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{value}</a> : value) : <span style={{ color: 'var(--muted)' }}>—</span>}
      </div>
    </div>
  );
}

function Pill({ text }: { text: string }) {
  const good = ['won', 'active', 'accepted', 'paid', 'completed', 'done'].includes(text);
  const bad = ['lost', 'rejected', 'cancelled', 'expired'].includes(text);
  return (
    <span style={{
      fontSize: 11.5, textTransform: 'capitalize', border: '1px solid', borderRadius: 999, padding: '2px 9px',
      color: good ? 'var(--good)' : bad ? 'var(--bad)' : 'var(--muted)', borderColor: 'currentColor',
    }}>
      {text.replace(/_/g, ' ')}
    </span>
  );
}

function Table({ cols, rows, empty }: { cols: string[]; rows: Array<Array<React.ReactNode>>; empty: string }) {
  if (rows.length === 0) return <p style={{ color: 'var(--muted)', margin: 0, padding: 8 }}>{empty}</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', textAlign: 'left' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const st = {
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 } as CSSProperties,
  h1: { fontSize: 24, margin: 0, color: 'var(--accent)' } as CSSProperties,
  statusPill: { fontSize: 11.5, textTransform: 'capitalize', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', color: 'var(--fg)' } as CSSProperties,
  healthPill: { fontSize: 11.5, border: '1px solid', borderRadius: 999, padding: '3px 10px', fontWeight: 600 } as CSSProperties,
  subline: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)', marginTop: 6 } as CSSProperties,
  actionBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none', background: 'var(--panel)' } as CSSProperties,
  stats: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginBottom: 12 } as CSSProperties,
  chain: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 16px', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 14, fontSize: 12.5 } as CSSProperties,
  chainAccount: { fontWeight: 800, color: 'var(--accent)' } as CSSProperties,
  chainNode: { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', color: 'var(--muted)', textDecoration: 'none' } as CSSProperties,
  chainNodeActive: { color: 'var(--fg)', borderColor: 'var(--accent)' } as CSSProperties,
  tabs: { display: 'inline-flex', gap: 4, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, marginBottom: 12, flexWrap: 'wrap' } as CSSProperties,
  tab: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as CSSProperties,
  tabOn: { background: 'var(--accent-grad, var(--accent))', color: 'var(--accent-ink, #fff)', fontWeight: 700 } as CSSProperties,
  tabCount: { fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.18)', borderRadius: 999, padding: '1px 6px' } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: 'var(--panel)' } as CSSProperties,
  overviewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 } as CSSProperties,
  rowLink: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 12.5 } as CSSProperties,
  tlRow: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '7px 4px', borderBottom: '1px solid var(--border)', fontSize: 13 } as CSSProperties,
  tlGlyph: { color: 'var(--accent)', width: 16, textAlign: 'center', flexShrink: 0 } as CSSProperties,
  tlDate: { color: 'var(--muted)', fontSize: 12, width: 86, flexShrink: 0 } as CSSProperties,
  tlLabel: { minWidth: 0 } as CSSProperties,
};
