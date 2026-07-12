'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  STAKEHOLDER_ROLE_LABEL, STAKEHOLDER_ROLE_OPTIONS,
  STRENGTH_LABEL, STRENGTH_COLOR, STRENGTH_OPTIONS,
} from './stakeholder-meta';

// Contact 360 — the stakeholder command center. Header (role + strength + account
// hierarchy) → snapshot → stakeholder map (manager / reports / peers) → the deals
// this person is involved in → interaction timeline.

interface Contact {
  id: string; name: string; jobTitle: string | null; email: string | null; phone: string | null;
  accountId: string | null; accountName: string | null; isPrimary: boolean;
  stakeholderRole: string | null; relationshipStrength: string | null;
  reportsToId: string | null; reportsToName: string | null; ownerId: string | null; createdAt: string;
}
interface Peer { id: string; name: string; jobTitle: string | null; stakeholderRole: string | null; relationshipStrength: string | null; isPrimary: boolean; reportsToId: string | null }
interface Opp { id: string; title: string; value: number; stage: string; winProbability: number; closeDate: string | null }
interface TenderRec { id: string; title: string; reference: string | null; status: string; value: number }
interface QuoteRec { id: string; quoteNumber: string; status: string; total: number; issueDate: string }
interface ContractRec { id: string; title: string; status: string; value: number; createdAt: string }
interface ProjectRec { id: string; title: string; status: string; createdAt: string }
interface ActivityRec { id: string; type: string; subject: string; status: string; dueDate: string | null; createdAt: string }
interface TimelineEntry { at: string; kind: string; label: string; href: string | null }

interface Payload {
  contact: Contact;
  account: { id: string; name: string; status: string } | null;
  reportsTo: Contact | null;
  reports: Contact[];
  peers: Peer[];
  opportunities: Opp[];
  tenders: TenderRec[];
  quotations: QuoteRec[];
  contracts: ContractRec[];
  projects: ProjectRec[];
  activities: ActivityRec[];
  summary: {
    accountName: string | null; openOpportunities: number; pipelineValue: number;
    activeContracts: number; activeProjects: number; interactions: number;
    openActions: number; lastInteractionAt: string | null;
  };
  timeline: TimelineEntry[];
}

type Tab = 'overview' | 'deals' | 'activity';

const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
const d = (iso: string): string => new Date(iso).toLocaleDateString();
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function Contact360Client({ contactId }: { contactId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/contacts/${contactId}/summary`, { cache: 'no-store' });
    if (!res.ok) { setErr('Failed to load the contact'); return; }
    setData(await res.json());
  }, [contactId]);

  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/crm/contacts/${contactId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      await load();
    } finally { setBusy(false); }
  }, [contactId, load]);

  if (!data) return <p style={{ color: 'var(--muted)' }}>{err ?? 'Loading contact…'}</p>;

  const { contact: c, account, reportsTo, reports, peers, opportunities, tenders, quotations, contracts, projects, activities, summary, timeline } = data;
  const roleLabel = c.stakeholderRole ? STAKEHOLDER_ROLE_LABEL[c.stakeholderRole] ?? c.stakeholderRole : null;
  const strengthColor = c.relationshipStrength ? STRENGTH_COLOR[c.relationshipStrength] ?? 'var(--muted)' : 'var(--muted)';

  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'deals', label: 'Deals', count: opportunities.length + tenders.length + quotations.length + contracts.length + projects.length },
    { id: 'activity', label: 'Activity', count: activities.length },
  ];

  return (
    <div>
      {/* header */}
      <div style={st.header}>
        <div style={{ minWidth: 0 }}>
          <h1 style={st.h1}>
            {c.isPrimary && <span title="Primary contact for the account" style={{ color: 'var(--accent)' }}>★ </span>}
            {c.name}
          </h1>
          <div style={st.subline}>
            {c.jobTitle && <span>{c.jobTitle}</span>}
            {account
              ? <span>at <a href={`/crm/accounts/${account.id}`} style={st.link}>{account.name}</a></span>
              : c.accountName && <span>at {c.accountName}</span>}
            {reportsTo && <span>reports to <a href={`/crm/contacts/${reportsTo.id}`} style={st.link}>{reportsTo.name}</a></span>}
            <span>Last interaction: {ago(summary.lastInteractionAt)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={st.metaLabel}>Stakeholder role</span>
            <select disabled={busy} value={c.stakeholderRole ?? ''} onChange={(e) => void patch({ stakeholderRole: e.target.value })} style={st.select}>
              <option value="">— unset —</option>
              {STAKEHOLDER_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span style={st.metaLabel}>Relationship</span>
            <select disabled={busy} value={c.relationshipStrength ?? ''} onChange={(e) => void patch({ relationshipStrength: e.target.value })} style={{ ...st.select, color: strengthColor, fontWeight: 700 }}>
              <option value="">— unset —</option>
              {STRENGTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {c.email && <a href={`mailto:${c.email}`} style={st.actionBtn}>✉ Email</a>}
          {c.phone && <a href={`tel:${c.phone}`} style={st.actionBtn}>☎ Call</a>}
          <a href="/crm/activities" style={st.actionBtn}>+ Log activity</a>
        </div>
      </div>

      {/* snapshot */}
      <div style={st.stats}>
        <Stat label="Open opportunities" value={String(summary.openOpportunities)} />
        <Stat label="Pipeline (account)" value={`AED ${aed(summary.pipelineValue)}`} accent />
        <Stat label="Active contracts" value={String(summary.activeContracts)} />
        <Stat label="Active projects" value={String(summary.activeProjects)} />
        <Stat label="Interactions" value={String(summary.interactions)} />
        <Stat label="Open actions" value={String(summary.openActions)} tone={summary.openActions > 0 ? 'warn' : undefined} />
      </div>

      {/* tabs */}
      <div style={st.tabs}>
        {TABS.map((t) => (
          <button key={t.id} style={{ ...st.tab, ...(tab === t.id ? st.tabOn : {}) }} onClick={() => setTab(t.id)}>
            {t.label}{t.count !== undefined && t.count > 0 && <span style={st.tabCount}>{t.count}</span>}
          </button>
        ))}
      </div>

      <section style={st.card}>
        {tab === 'overview' && (
          <div style={st.grid}>
            {/* Stakeholder map */}
            <div style={st.block}>
              <div style={st.blockTitle}>Stakeholder Map — {summary.accountName ?? 'no account'}</div>
              {reportsTo && (
                <div style={st.mapRow}>
                  <span style={st.mapTag}>Manager</span>
                  <a href={`/crm/contacts/${reportsTo.id}`} style={st.link}>{reportsTo.name}</a>
                  {reportsTo.jobTitle && <span style={st.muted}>· {reportsTo.jobTitle}</span>}
                </div>
              )}
              <div style={st.mapRow}>
                <span style={{ ...st.mapTag, background: 'var(--accent)', color: '#fff' }}>This person</span>
                <b>{c.name}</b>{roleLabel && <span style={st.rolePill}>{roleLabel}</span>}
              </div>
              {reports.length > 0 && reports.map((r) => (
                <div key={r.id} style={{ ...st.mapRow, paddingLeft: 18 }}>
                  <span style={st.mapTag}>Reports</span>
                  <a href={`/crm/contacts/${r.id}`} style={st.link}>{r.name}</a>
                  {r.jobTitle && <span style={st.muted}>· {r.jobTitle}</span>}
                </div>
              ))}
              {peers.length === 0 && reports.length === 0 && !reportsTo && (
                <p style={st.muted}>No other stakeholders mapped at this account yet.</p>
              )}
              {peers.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={st.muted}>Other stakeholders</div>
                  {peers.map((p) => (
                    <div key={p.id} style={st.peerRow}>
                      {p.isPrimary && <span style={{ color: 'var(--accent)' }}>★</span>}
                      <a href={`/crm/contacts/${p.id}`} style={st.link}>{p.name}</a>
                      {p.stakeholderRole && <span style={st.rolePill}>{STAKEHOLDER_ROLE_LABEL[p.stakeholderRole] ?? p.stakeholderRole}</span>}
                      {p.relationshipStrength && <span style={{ fontSize: 11, color: STRENGTH_COLOR[p.relationshipStrength] ?? 'var(--muted)', fontWeight: 700 }}>{STRENGTH_LABEL[p.relationshipStrength] ?? p.relationshipStrength}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contact details */}
            <div style={st.block}>
              <div style={st.blockTitle}>Details</div>
              <Info label="Email" value={c.email} link={c.email ? `mailto:${c.email}` : undefined} />
              <Info label="Phone" value={c.phone} link={c.phone ? `tel:${c.phone}` : undefined} />
              <Info label="Owner" value={c.ownerId} />
              <Info label="Added" value={d(c.createdAt)} />
            </div>

            {/* Upcoming actions */}
            <div style={st.block}>
              <div style={st.blockTitle}>Upcoming Actions</div>
              {activities.filter((a) => a.status === 'open').length === 0 ? (
                <p style={st.muted}>No open activities — <a href="/crm/activities" style={st.link}>log the next step →</a></p>
              ) : (
                activities.filter((a) => a.status === 'open').slice(0, 6).map((a) => (
                  <div key={a.id} style={st.tlRow}>
                    <span style={{ ...st.tlDate, width: 74 }}>{a.dueDate ? d(a.dueDate) : 'no due'}</span>
                    <span><b style={{ textTransform: 'capitalize' }}>{a.type}</b> · {a.subject}</span>
                  </div>
                ))
              )}
            </div>

            {/* Recent interactions */}
            <div style={st.block}>
              <div style={st.blockTitle}>Recent Interactions</div>
              {timeline.length === 0 ? <p style={st.muted}>Nothing logged yet.</p> : timeline.slice(0, 8).map((t, i) => (
                <div key={i} style={st.tlRow}>
                  <span style={st.tlDate}>{d(t.at)}</span>
                  {t.href ? <a href={t.href} style={{ ...st.link, textDecoration: 'none', color: 'var(--fg)' }}>{t.label}</a> : <span>{t.label}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'deals' && (
          <div>
            <p style={st.muted}>Deals at {summary.accountName ?? 'this account'} this stakeholder is involved in.</p>
            <DealTable title="Opportunities" cols={['Title', 'Stage', 'Value', 'Win %']} rows={opportunities.map((o) => [o.title, o.stage, `AED ${aed(o.value)}`, `${o.winProbability}%`])} href="/crm/leads" />
            <DealTable title="Tenders" cols={['Tender', 'Ref', 'Status', 'Value']} rows={tenders.map((t) => [t.title, t.reference ?? '—', t.status, `AED ${aed(t.value)}`])} />
            <DealTable title="Quotations" cols={['Number', 'Status', 'Total', 'Issued']} rows={quotations.map((q) => [q.quoteNumber, q.status, `AED ${aed(q.total)}`, q.issueDate])} href="/crm/quotations" />
            <DealTable title="Contracts" cols={['Contract', 'Status', 'Value', 'Awarded']} rows={contracts.map((ct) => [ct.title, ct.status, `AED ${aed(ct.value)}`, d(ct.createdAt)])} />
            <DealTable title="Projects" cols={['Project', 'Status', 'Started']} rows={projects.map((p) => [p.title, p.status, d(p.createdAt)])} />
          </div>
        )}

        {tab === 'activity' && (
          activities.length === 0 ? <p style={st.muted}>No activities logged against this contact.</p> : (
            <table style={st.table}>
              <thead><tr>{['Type', 'Subject', 'Status', 'Due', 'Logged'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...st.td, textTransform: 'capitalize' }}>{a.type}</td>
                    <td style={st.td}>{a.subject}</td>
                    <td style={{ ...st.td, textTransform: 'capitalize' }}>{a.status}</td>
                    <td style={st.td}>{a.dueDate ? d(a.dueDate) : '—'}</td>
                    <td style={st.td}>{d(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: 'warn' }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone === 'warn' ? 'var(--warn, #d97706)' : accent ? 'var(--accent)' : 'var(--fg)' }}>{value}</div>
    </div>
  );
}

function Info({ label, value, link }: { label: string; value: string | null; link?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 13.5 }}>{value ? (link ? <a href={link} style={{ color: 'var(--accent)' }}>{value}</a> : value) : <span style={{ color: 'var(--muted)' }}>—</span>}</div>
    </div>
  );
}

function DealTable({ title, cols, rows, href }: { title: string; cols: string[]; rows: string[][]; href?: string }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>{title} ({rows.length})</div>
      {rows.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: 0 }}>None.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{cols.map((c) => <th key={c} style={{ textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{r.map((cell, j) => (
                  <td key={j} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                    {j === 0 && href ? <a href={href} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{cell}</a> : cell}
                  </td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const st = {
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 } as CSSProperties,
  h1: { fontSize: 25, margin: '0 0 6px', color: 'var(--accent)', letterSpacing: -0.4 } as CSSProperties,
  subline: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  metaLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' } as CSSProperties,
  select: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', padding: '4px 8px', fontSize: 12.5 } as CSSProperties,
  actionBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none', background: 'var(--panel)', whiteSpace: 'nowrap' } as CSSProperties,
  stats: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginBottom: 12 } as CSSProperties,
  tabs: { display: 'inline-flex', gap: 4, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, marginBottom: 12, flexWrap: 'wrap' } as CSSProperties,
  tab: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as CSSProperties,
  tabOn: { background: 'var(--accent-grad, var(--accent))', color: 'var(--accent-ink, #fff)', fontWeight: 700 } as CSSProperties,
  tabCount: { fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.18)', borderRadius: 999, padding: '1px 6px' } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: 'var(--panel)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 } as CSSProperties,
  block: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--panel-2, var(--panel))' } as CSSProperties,
  blockTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 800, marginBottom: 8 } as CSSProperties,
  mapRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 } as CSSProperties,
  mapTag: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 6px', color: 'var(--muted)' } as CSSProperties,
  rolePill: { fontSize: 10.5, border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px', color: 'var(--fg)' } as CSSProperties,
  peerRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12.5 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: '4px 0' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  tlRow: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 2px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  tlDate: { color: 'var(--muted)', fontSize: 12, width: 86, flexShrink: 0 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', textAlign: 'left' } as CSSProperties,
  td: { padding: '9px 10px', borderBottom: '1px solid var(--border)' } as CSSProperties,
};
