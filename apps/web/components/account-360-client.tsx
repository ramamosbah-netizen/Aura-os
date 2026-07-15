'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { STAKEHOLDER_ROLE_LABEL, STRENGTH_LABEL, STRENGTH_COLOR } from './stakeholder-meta';
import Timeline from './timeline';
import RelationshipGraphPanel from './relationship-graph-panel';

// Account 360 — the customer COMMAND CENTER. The Account is the persistent
// commercial party every deal revolves around (the hub, not the first step).
// Header (identity + relationship health) → snapshot (Commercial | Delivery &
// Finance) → Commercial Portfolio (both deal routes, clickable) → tabs, where
// Overview is a composite: health, exposure, upcoming actions, recent activity,
// key contacts, profile.

interface Account {
  id: string;
  name: string;
  status: string;
  partyType: string | null;
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
interface Contact { id: string; name: string; role?: string | null; jobTitle?: string | null; email?: string | null; phone?: string | null; status?: string; isPrimary?: boolean; stakeholderRole?: string | null; relationshipStrength?: string | null; reportsToId?: string | null; createdAt: string }
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

type Tab = 'overview' | 'contacts' | 'opportunities' | 'tenders' | 'quotations' | 'contracts' | 'projects' | 'financials' | 'activity';

const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2 }).format(n);
const d = (iso: string): string => new Date(iso).toLocaleDateString();
const monthYear = (iso: string): string => new Date(iso).toLocaleDateString('en', { month: 'short', year: 'numeric' });

const STAGE_LABEL: Record<string, string> = {
  prospect: 'Prospect',
  qualified: 'Qualified',
  active_customer: 'Active Customer',
  strategic: 'Strategic Account',
  dormant: 'Dormant',
  inactive: 'Inactive',
};

// G6 — what the party IS, shown beside the relationship stage in the header.
const PARTY_LABEL: Record<string, string> = {
  end_client: 'End Client',
  consultant: 'Consultant',
  main_contractor: 'Main Contractor',
  developer: 'Developer',
  supplier: 'Supplier',
  partner: 'Partner',
  subcontractor: 'Subcontractor',
  government: 'Government',
  other: 'Other',
};

export default function Account360Client({ accountId }: { accountId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);

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

  const patchAccount = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/crm/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }, [accountId, load]);

  const assignToMe = useCallback(async () => {
    setBusy(true);
    try {
      await fetch('/api/crm/accounts/assign-owner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }, [accountId, load]);

  if (!data) return <p style={{ color: 'var(--muted)' }}>{err ?? 'Loading account…'}</p>;

  const { account: a, contacts, opportunities, tenders, quotations, contracts, projects, activities, receivables, summary } = data;

  // ── Relationship health (derived, with the WHY) ─────────────────────────
  const openOpps = opportunities.filter((o) => o.stage !== 'won' && o.stage !== 'lost');
  const activeContracts = contracts.filter((c) => c.status === 'active');
  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'planned');
  const liveBusiness = activeContracts.length > 0 || activeProjects.length > 0 || openOpps.length > 0;
  const stageMismatch = contracts.length > 0 && (a.status === 'prospect' || a.status === 'qualified' || a.status === 'lead');
  const healthReasons: string[] = [];
  if (receivables.overdue > 0) healthReasons.push(`AED ${aed(receivables.overdue)} overdue receivables`);
  if (liveBusiness && !a.ownerId) healthReasons.push('no account owner assigned');
  if (stageMismatch) healthReasons.push('has contracts but still marked a prospect');
  const health: 'healthy' | 'attention' | 'at_risk' = receivables.overdue > 0 ? 'at_risk' : healthReasons.length ? 'attention' : 'healthy';
  const HEALTH = {
    healthy: { dot: '🟢', label: 'Healthy', color: 'var(--good)' },
    attention: { dot: '🟠', label: 'Attention Required', color: 'var(--warn, #d97706)' },
    at_risk: { dot: '🔴', label: 'At Risk', color: 'var(--bad)' },
  }[health];

  const upcoming = activities
    .filter((x) => x.status !== 'done' && x.status !== 'cancelled')
    .sort((x, y) => (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999'))
    .slice(0, 6);

  const tenderedQuotes = quotations.filter((q) => q.sourceTenderId).length;
  const directQuotes = quotations.length - tenderedQuotes;

  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: 'Contacts', count: contacts.length },
    { id: 'opportunities', label: 'Opportunities', count: opportunities.length },
    { id: 'tenders', label: 'Tenders', count: tenders.length },
    { id: 'quotations', label: 'Quotations', count: quotations.length },
    { id: 'contracts', label: 'Contracts', count: contracts.length },
    { id: 'projects', label: 'Projects', count: projects.length },
    { id: 'financials', label: 'Financials', count: receivables.invoiceCount },
    { id: 'activity', label: 'Activity', count: activities.length },
  ];

  const chip = (label: string, count: number, target: Tab, value?: number) => (
    <button key={label} onClick={() => setTab(target)} style={{ ...st.chainNode, ...(count > 0 ? st.chainNodeActive : {}), cursor: 'pointer' }}>
      {label} <b>{count}</b>
      {value !== undefined && value > 0 && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {aed(value)}</span>}
    </button>
  );
  const arrow = <span style={{ color: 'var(--muted)' }}>→</span>;

  return (
    <div>
      {/* ── Header: identity + relationship health ── */}
      <div style={st.header}>
        <div style={{ minWidth: 0 }}>
          <h1 style={st.h1}>{a.name}</h1>
          <div style={st.subline}>
            <span style={st.stagePill}>{STAGE_LABEL[a.status] ?? a.status}</span>
            {a.partyType && <span style={st.stagePill}>{PARTY_LABEL[a.partyType] ?? a.partyType}</span>}
            {a.industry && <span>{a.industry}</span>}
            <span>Client since {monthYear(a.createdAt)}</span>
            {a.source && <span>Source: {a.source}</span>}
            <span>
              Owner:{' '}
              {a.ownerId ?? <span style={{ color: 'var(--muted)' }}>Unassigned</span>}
              {!a.ownerId && (
                <button disabled={busy} onClick={() => void assignToMe()} style={st.inlineAction}>Assign to me</button>
              )}
            </span>
          </div>
          <div style={{ ...st.healthLine, color: HEALTH.color }}>
            Relationship Health: {HEALTH.dot} {HEALTH.label}
            {healthReasons.length > 0 && <span style={{ color: 'var(--muted)', fontWeight: 500 }}> — {healthReasons.join(' · ')}</span>}
            {stageMismatch && (
              <button disabled={busy} onClick={() => void patchAccount({ status: 'active_customer' })} style={st.inlineAction}>
                Promote to Active Customer
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/crm/leads" style={st.actionBtn}>+ Opportunity</a>
          <a href="/crm/quotations" style={st.actionBtn}>+ Quotation</a>
          <a href="/tendering/tenders" style={st.actionBtn}>+ Tender</a>
          <details style={{ position: 'relative' }}>
            <summary style={{ ...st.actionBtn, listStyle: 'none', cursor: 'pointer' }}>Export ▾</summary>
            <div style={st.menu}>
              <a href={`/api/crm/accounts/${a.id}/dossier/xlsx`} style={st.menuItem}>⤓ Customer dossier (Excel)</a>
              <a href={`/crm/accounts/${a.id}/print`} style={st.menuItem}>🖨 Customer dossier (PDF)</a>
            </div>
          </details>
          <details style={{ position: 'relative' }}>
            <summary style={{ ...st.actionBtn, listStyle: 'none', cursor: 'pointer' }}>More ▾</summary>
            <div style={st.menu}>
              <a href="/crm/contacts" style={st.menuItem}>+ Contact</a>
              <a href="/crm/activities" style={st.menuItem}>+ Activity</a>
              <a href="/finance/ar" style={st.menuItem}>Accounts receivable →</a>
            </div>
          </details>
        </div>
      </div>

      {/* ── Account snapshot: Commercial | Delivery & Finance ── */}
      <div style={st.snapshotRow}>
        <div style={st.snapshotGroup}>
          <div style={st.groupTitle}>Commercial</div>
          <div style={st.groupStats}>
            <Stat label="Open pipeline" value={`AED ${aed(summary.pipelineValue)}`} accent />
            <Stat label="Active opportunities" value={String(summary.activeOpportunities)} />
            <Stat label="Contracted value" value={`AED ${aed(summary.wonValue)}`} strong accent />
            <Stat label="Active contracts" value={`${activeContracts.length} / ${contracts.length}`} />
          </div>
        </div>
        <div style={st.snapshotGroup}>
          <div style={st.groupTitle}>Delivery &amp; Finance</div>
          <div style={st.groupStats}>
            <Stat label="Active projects" value={`${activeProjects.length} / ${projects.length}`} />
            <Stat label="Open tenders" value={`${summary.openTenders} / ${summary.tenderCount}`} />
            <Stat label="Quotations" value={String(summary.quotationCount)} />
            <Stat label="Outstanding AR" value={`AED ${aed(summary.outstandingReceivables)}`} strong tone={receivables.overdue > 0 ? 'bad' : undefined} />
          </div>
        </div>
      </div>

      {/* ── Commercial Portfolio: the account is the hub — both deal routes ── */}
      <div style={st.chain}>
        <div style={st.chainTitle}>Commercial Portfolio</div>
        <div style={st.chainRow}>
          <span style={st.chainAccount}>◆ {a.name}</span>
          <span style={st.routeLabel}>↳ tendered</span>
          {chip('Opportunities', opportunities.length, 'opportunities', summary.pipelineValue)}
          {arrow}
          {chip('Tenders', tenders.length, 'tenders')}
          {arrow}
          {chip('Quotations', tenderedQuotes, 'quotations')}
          {arrow}
          {chip('Contracts', contracts.length, 'contracts', summary.wonValue)}
          {arrow}
          {chip('Projects', projects.length, 'projects')}
        </div>
        <div style={st.chainRow}>
          <span style={{ ...st.chainAccount, visibility: 'hidden' }}>◆ {a.name}</span>
          <span style={st.routeLabel}>↳ direct</span>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Opportunity</span>
          {arrow}
          {chip('Quotations', directQuotes, 'quotations')}
          {arrow}
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Contract → Project</span>
        </div>
      </div>

      {/* ── Tabs ── */}
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
          <div style={st.overviewCols}>
            {/* Relationship health */}
            <div style={st.oCard}>
              <div style={st.oTitle}>Relationship Health</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: HEALTH.color, marginBottom: 6 }}>{HEALTH.dot} {HEALTH.label}</div>
              {healthReasons.length === 0 ? (
                <p style={st.oMuted}>No open issues — receivables current{a.ownerId ? ', owner assigned' : ''}.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--fg)' }}>
                  {healthReasons.map((r) => <li key={r} style={{ marginBottom: 3 }}>{r}</li>)}
                </ul>
              )}
            </div>

            {/* Financial exposure */}
            <div style={st.oCard}>
              <div style={st.oTitle}>Financial Exposure</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Stat label="Invoiced" value={`AED ${aed(receivables.invoiced)}`} />
                <Stat label="Collected" value={`AED ${aed(receivables.paid)}`} />
                <Stat label="Outstanding" value={`AED ${aed(receivables.outstanding)}`} strong />
                <Stat label="Overdue" value={`AED ${aed(receivables.overdue)}`} strong tone={receivables.overdue > 0 ? 'bad' : undefined} />
              </div>
              <p style={{ ...st.oMuted, marginTop: 8 }}>
                Terms: {a.paymentTerms ?? '—'} · <button onClick={() => setTab('financials')} style={st.linkBtn}>Financials →</button>
              </p>
            </div>

            {/* Upcoming actions */}
            <div style={st.oCard}>
              <div style={st.oTitle}>Upcoming Actions</div>
              {upcoming.length === 0 ? (
                <p style={st.oMuted}>No open activities — <a href="/crm/activities" style={st.rowLink}>log the next step →</a></p>
              ) : (
                upcoming.map((x) => (
                  <div key={x.id} style={st.tlRow}>
                    <span style={{ ...st.tlDate, width: 74 }}>{x.dueDate ? d(x.dueDate) : 'no due'}</span>
                    <span style={st.tlLabel}><b style={{ textTransform: 'capitalize' }}>{x.type}</b> · {x.subject}</span>
                  </div>
                ))
              )}
            </div>

            {/* Unified timeline — events + activities (standardized component) */}
            <div style={st.oCard}>
              <div style={st.oTitle}>Timeline</div>
              <Timeline recordId={a.id} />
            </div>

            {/* G6 — related parties: who surrounds this account, and leads naming it */}
            <div style={st.oCard}>
              <div style={st.oTitle}>Related Parties</div>
              <RelationshipGraphPanel accountId={a.id} />
            </div>

            {/* Key contacts */}
            <div style={st.oCard}>
              <div style={st.oTitle}>Key Contacts</div>
              {contacts.length === 0 ? (
                <p style={st.oMuted}>No contacts yet — <a href="/crm/contacts" style={st.rowLink}>add the people you deal with →</a></p>
              ) : (
                [...contacts].sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary)).slice(0, 4).map((c) => (
                  <div key={c.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    {c.isPrimary && <span style={{ color: 'var(--accent)' }}>★ </span>}
                    <a href={`/crm/contacts/${c.id}`} style={st.rowLink}>{c.name}</a>
                    {c.stakeholderRole ? <span style={{ color: 'var(--muted)' }}> · {STAKEHOLDER_ROLE_LABEL[c.stakeholderRole] ?? c.stakeholderRole}</span> : c.jobTitle ? <span style={{ color: 'var(--muted)' }}> · {c.jobTitle}</span> : null}
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                ))
              )}
            </div>

            {/* Profile */}
            <div style={st.oCard}>
              <div style={st.oTitle}>Account Profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Info label="Industry" value={a.industry} />
                <Info label="Website" value={a.website} link />
                <Info label="Phone" value={a.phone} />
                <Info label="Email" value={a.email} />
                <Info label="Billing address" value={a.billingAddress} wide />
                <Info label="Source" value={a.source} />
                <Info label="Client since" value={d(a.createdAt)} />
              </div>
            </div>
          </div>
        )}

        {tab === 'contacts' && (
          contacts.length === 0 ? (
            <p style={{ color: 'var(--muted)', margin: 0, padding: 8 }}>No contacts yet — add the people you deal with at this client.</p>
          ) : (
            <div>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px' }}>
                The stakeholder map — everyone involved in the buying decision at {a.name}, by role and relationship strength.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr>
                    {['', 'Name', 'Title', 'Stakeholder role', 'Relationship', 'Reports to', 'Email'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[...contacts].sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary)).map((c) => (
                      <tr key={c.id}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', color: 'var(--accent)' }}>{c.isPrimary ? '★' : ''}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)' }}>
                          <a href={`/crm/contacts/${c.id}`} style={st.rowLink}>{c.name}</a>
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{c.jobTitle ?? c.role ?? '—'}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)' }}>
                          {c.stakeholderRole ? <span style={{ fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px' }}>{STAKEHOLDER_ROLE_LABEL[c.stakeholderRole] ?? c.stakeholderRole}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: c.relationshipStrength ? STRENGTH_COLOR[c.relationshipStrength] ?? 'var(--muted)' : 'var(--muted)' }}>
                          {c.relationshipStrength ? STRENGTH_LABEL[c.relationshipStrength] ?? c.relationshipStrength : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                          {c.reportsToId ? contacts.find((p) => p.id === c.reportsToId)?.name ?? '—' : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)' }}>{c.email ? <a href={`mailto:${c.email}`} style={st.rowLink}>{c.email}</a> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
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
            cols={['Number', 'Route', 'Status', 'Total', 'Issued', '']}
            rows={quotations.map((q) => [
              q.quoteNumber,
              q.sourceTenderId ? 'Tendered' : 'Direct',
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

        {tab === 'activity' && (
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
      </section>
    </div>
  );
}

function Stat({ label, value, strong, accent, tone }: { label: string; value: string; strong?: boolean; accent?: boolean; tone?: 'bad' }) {
  return (
    <div style={{ minWidth: 110 }}>
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
  h1: { fontSize: 26, margin: '0 0 6px', color: 'var(--accent)', letterSpacing: -0.4 } as CSSProperties,
  stagePill: { fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', color: 'var(--fg)', fontWeight: 700, background: 'var(--panel)' } as CSSProperties,
  subline: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  healthLine: { marginTop: 8, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  inlineAction: { marginLeft: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--accent)', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  actionBtn: { display: 'inline-block', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none', background: 'var(--panel)', whiteSpace: 'nowrap' } as CSSProperties,
  menu: { position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 2 } as CSSProperties,
  menuItem: { display: 'block', padding: '7px 10px', borderRadius: 7, color: 'var(--fg)', textDecoration: 'none', fontSize: 12.5, fontWeight: 600 } as CSSProperties,
  snapshotRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 10, marginBottom: 12 } as CSSProperties,
  snapshotGroup: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: '12px 16px' } as CSSProperties,
  groupTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--accent)', fontWeight: 800, marginBottom: 8 } as CSSProperties,
  groupStats: { display: 'flex', gap: 22, flexWrap: 'wrap' } as CSSProperties,
  stats: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' } as CSSProperties,
  chain: { padding: '10px 16px 12px', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 14 } as CSSProperties,
  chainTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--accent)', fontWeight: 800, marginBottom: 8 } as CSSProperties,
  chainRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, padding: '3px 0' } as CSSProperties,
  chainAccount: { fontWeight: 800, color: 'var(--accent)' } as CSSProperties,
  routeLabel: { color: 'var(--muted)', fontSize: 11.5, fontStyle: 'italic', width: 66 } as CSSProperties,
  chainNode: { border: '1px solid var(--border)', background: 'transparent', borderRadius: 999, padding: '4px 12px', color: 'var(--muted)', textDecoration: 'none', fontSize: 12.5 } as CSSProperties,
  chainNodeActive: { color: 'var(--fg)', borderColor: 'var(--accent)' } as CSSProperties,
  tabs: { display: 'inline-flex', gap: 4, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, marginBottom: 12, flexWrap: 'wrap' } as CSSProperties,
  tab: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as CSSProperties,
  tabOn: { background: 'var(--accent-grad, var(--accent))', color: 'var(--accent-ink, #fff)', fontWeight: 700 } as CSSProperties,
  tabCount: { fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.18)', borderRadius: 999, padding: '1px 6px' } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: 'var(--panel)' } as CSSProperties,
  overviewCols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 } as CSSProperties,
  oCard: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--panel-2, var(--panel))' } as CSSProperties,
  oTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 800, marginBottom: 8 } as CSSProperties,
  oMuted: { color: 'var(--muted)', fontSize: 12.5, margin: 0 } as CSSProperties,
  linkBtn: { border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 } as CSSProperties,
  rowLink: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 12.5 } as CSSProperties,
  tlRow: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 2px', borderBottom: '1px solid var(--border)', fontSize: 13 } as CSSProperties,
  tlGlyph: { color: 'var(--accent)', width: 16, textAlign: 'center', flexShrink: 0 } as CSSProperties,
  tlDate: { color: 'var(--muted)', fontSize: 12, width: 86, flexShrink: 0 } as CSSProperties,
  tlLabel: { minWidth: 0 } as CSSProperties,
};
