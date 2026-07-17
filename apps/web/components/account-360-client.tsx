'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  STAKEHOLDER_ROLE_LABEL, STAKEHOLDER_ROLE_OPTIONS,
  STRENGTH_LABEL, STRENGTH_COLOR, STRENGTH_OPTIONS,
} from './stakeholder-meta';
import CreateDrawer from './ui/create-drawer';
import {
  RecordHeader, KpiRow, RecordTabs, ActionButton, SituationBand,
  type Tone, type KpiItem, type MetaItem, type TabDef,
  type HealthState, type NextBestAction,
} from './crm/record-shell';
import Timeline from './timeline';
import RelationshipGraphPanel from './relationship-graph-panel';
import InstalledBasePanel from './installed-base-panel';

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
interface TeamUser { username: string; role?: string; roleLabel?: string; isAdmin?: boolean }
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
  // Identity for ownership: the account owner is stored as a workspace username
  // (e.g. "u-pm"), so "me" comes from /workspace/me — NOT the session `sub`, which
  // need not equal the username and is absent in the dev pass-through.
  const [me, setMe] = useState<TeamUser | null>(null);
  const [team, setTeam] = useState<TeamUser[]>([]);
  // Outcome Loop — capture what happened after acting so the relationship never goes quiet.
  const [outcomeNote, setOutcomeNote] = useState<string | null>(null);

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

  // Who am I + the assignable team, loaded once. A manager/admin gets the full
  // picker (assign to anyone); everyone else just gets the "assign to me" shortcut.
  useEffect(() => {
    void (async () => {
      const [meRes, teamRes] = await Promise.all([
        fetch('/api/workspace/me', { cache: 'no-store' }).catch(() => null),
        fetch('/api/workspace/users', { cache: 'no-store' }).catch(() => null),
      ]);
      if (meRes?.ok) {
        const m = (await meRes.json().catch(() => null)) as TeamUser | null;
        if (m && m.username) setMe(m);
      }
      if (teamRes?.ok) {
        const t = (await teamRes.json().catch(() => [])) as TeamUser[];
        if (Array.isArray(t)) setTeam(t);
      }
    })();
  }, []);

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

  // Direct ownerId PATCH — the old assign-owner BFF required a session cookie
  // (`sub`) that dev has none of, so it 401'd. Setting the username straight
  // through the account PATCH works for both "assign to me" and reassignment.
  const assignOwner = useCallback(
    (ownerId: string | null) => patchAccount({ ownerId }),
    [patchAccount],
  );

  // Contacts are managed inline from the Account 360 — set-primary, deactivate,
  // etc. — then the whole account summary reloads so counts and the header
  // primary contact stay in sync.
  const patchContact = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/crm/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (!data) return <p style={{ color: 'var(--muted)' }}>{err ?? 'Loading account…'}</p>;

  const { account: a, contacts, opportunities, tenders, quotations, contracts, projects, activities, receivables, summary } = data;

  // Contact drawer fields — the account is fixed to this page, so accountId is a
  // locked single-option select (guarantees it lands in the POST payload without
  // asking the user to pick the account they're already looking at).
  const contactFields = (selfId?: string) => [
    { name: 'name', label: 'Full name', kind: 'text' as const, required: true, placeholder: 'e.g. Khalid Mansoor', span: 2 as const },
    { name: 'jobTitle', label: 'Job title', kind: 'text' as const, placeholder: 'e.g. Procurement Manager' },
    { name: 'accountId', label: 'Account', kind: 'select' as const, options: [{ value: a.id, label: a.name }] },
    { name: 'stakeholderRole', label: 'Stakeholder role', kind: 'select' as const, placeholder: 'Role in the decision', options: STAKEHOLDER_ROLE_OPTIONS, hint: 'Decision maker, influencer, technical, finance…' },
    { name: 'relationshipStrength', label: 'Relationship', kind: 'select' as const, placeholder: 'How strong is it?', options: STRENGTH_OPTIONS },
    { name: 'reportsToId', label: 'Reports to', kind: 'select' as const, placeholder: 'Manager (optional)', options: contacts.filter((p) => p.id !== selfId).map((p) => ({ value: p.id, label: `${p.name}${p.jobTitle ? ` · ${p.jobTitle}` : ''}` })) },
    { name: 'email', label: 'Email', kind: 'text' as const, placeholder: 'name@company.com' },
    { name: 'phone', label: 'Phone', kind: 'text' as const, placeholder: '+971 …' },
  ];

  // Admins and managers may reassign ownership to anyone; the picker is theirs.
  const canManage = !!me && (me.isAdmin === true || /manager|executive|admin|lead/i.test(me.roleLabel ?? ''));
  const ownerLabel = (username: string): string => {
    const u = team.find((t) => t.username === username);
    return u?.roleLabel ? `${username} · ${u.roleLabel}` : username;
  };

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
  const healthTone: Tone = health === 'at_risk' ? 'bad' : health === 'attention' ? 'warn' : 'good';

  const upcoming = activities
    .filter((x) => x.status !== 'done' && x.status !== 'cancelled')
    .sort((x, y) => (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999'))
    .slice(0, 6);

  const tenderedQuotes = quotations.filter((q) => q.sourceTenderId).length;
  const directQuotes = quotations.length - tenderedQuotes;

  // ── Universal Object Shell — Situation / Business Health / Missing Info / Next Best Action ──
  // Account is the relationship hub — the band reads its health, exposure and coverage, never
  // re-deriving a rule the summary already resolved.
  const situationText = `${STAGE_LABEL[a.status] ?? a.status} · ${summary.activeOpportunities} open opps · AED ${aed(summary.pipelineValue)} pipeline${summary.wonValue > 0 ? ` · AED ${aed(summary.wonValue)} contracted` : ''}`;
  const bandHealth: HealthState = { label: HEALTH.label, tone: healthTone, reasons: healthReasons };

  // Missing Information — relationship gaps that cap growth.
  const hasPrimary = contacts.some((c) => c.isPrimary);
  const missing: string[] = [];
  if (!a.ownerId) missing.push('Account owner');
  if (contacts.length === 0) missing.push('Key contacts');
  else if (!hasPrimary) missing.push('Primary contact');
  if (openOpps.length === 0) missing.push('Open opportunity');
  if (upcoming.length === 0) missing.push('Next action');
  if (stageMismatch) missing.push('Stage (has contracts, still prospect)');

  // The ONE next best action.
  let nba: NextBestAction | undefined;
  if (receivables.overdue > 0) nba = { label: 'Chase overdue AR', hint: `AED ${aed(receivables.overdue)} overdue`, href: '/finance/ar' };
  else if (!a.ownerId) nba = { label: 'Assign an owner', hint: me ? 'assign to you' : 'no owner yet', onClick: () => { if (me) void assignOwner(me.username); } };
  else if (contacts.length === 0) nba = { label: 'Add key contacts', onClick: () => setTab('contacts') };
  else if (!hasPrimary) nba = { label: 'Set the primary contact', onClick: () => setTab('contacts') };
  else if (openOpps.length === 0) nba = { label: 'Create an opportunity', href: '/crm/leads' };
  else if (upcoming.length === 0) nba = { label: 'Schedule the next step', href: '/crm/activities' };

  // Outcome Loop — writes a real activity linked to this account (§17 activity stream).
  const logOutcome = async (choiceId: string): Promise<void> => {
    const plan: Record<string, { type: string; subject: string; status?: string }> = {
      completed: { type: 'note', subject: `Outcome — touchpoint with ${a.name}`, status: 'completed' },
      failed: { type: 'note', subject: `Outcome — ${a.name}: no response`, status: 'completed' },
      follow_up: { type: 'follow_up', subject: `Follow up: ${a.name}` },
      reschedule: { type: 'task', subject: `Reschedule: ${a.name}` },
    };
    const act = plan[choiceId];
    if (!act) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/crm/activities', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: act.type, subject: act.subject, relatedType: 'account', relatedId: a.id, relatedName: a.name, status: act.status }),
      });
      if (!res.ok) { setErr('Could not log the outcome'); return; }
      setOutcomeNote(`Logged: ${act.subject}`);
      await load();
    } finally { setBusy(false); }
  };

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
      {/* ── Header: identity + relationship health (shared record-shell) ── */}
      <RecordHeader
        title={a.name}
        status={STAGE_LABEL[a.status] ?? a.status}
        statusTone="accent"
        score={{ value: HEALTH.dot, label: 'Relationship', badge: HEALTH.label, badgeTone: healthTone }}
        meta={[
          ...(a.partyType ? [{ value: <span style={st.stagePill}>{PARTY_LABEL[a.partyType] ?? a.partyType}</span> }] as MetaItem[] : []),
          ...(a.industry ? [{ value: a.industry }] as MetaItem[] : []),
          { label: 'Client since', value: monthYear(a.createdAt) },
          ...(a.source ? [{ label: 'Source', value: a.source }] as MetaItem[] : []),
          {
            label: 'Owner',
            value: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {a.ownerId ? ownerLabel(a.ownerId) : <span style={{ color: 'var(--muted)' }}>Unassigned</span>}
                {me && a.ownerId !== me.username && (
                  <button disabled={busy} onClick={() => void assignOwner(me.username)} style={st.inlineAction}>Assign to me</button>
                )}
                {canManage && (
                  <select value={a.ownerId ?? ''} disabled={busy} onChange={(e) => void assignOwner(e.target.value || null)} style={st.ownerSelect} title="Assign owner — admin / manager">
                    <option value="">Unassigned</option>
                    {team.map((u) => (<option key={u.username} value={u.username}>{u.roleLabel ? `${u.username} · ${u.roleLabel}` : u.username}</option>))}
                  </select>
                )}
              </span>
            ),
          },
        ]}
        actions={
          <>
            <ActionButton href="/crm/leads">+ Opportunity</ActionButton>
            <ActionButton href="/crm/quotations">+ Quotation</ActionButton>
            <ActionButton href="/tendering/tenders">+ Tender</ActionButton>
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
                <button type="button" onClick={() => setTab('contacts')} style={{ ...st.menuItem, background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }}>+ Contact</button>
                <a href="/crm/activities" style={st.menuItem}>+ Activity</a>
                <a href="/finance/ar" style={st.menuItem}>Accounts receivable →</a>
              </div>
            </details>
            {stageMismatch && <ActionButton onClick={() => void patchAccount({ status: 'active_customer' })} disabled={busy}>Promote to Active Customer</ActionButton>}
          </>
        }
      />
      {healthReasons.length > 0 && (
        <div style={{ margin: '-4px 0 14px', fontSize: 12.5, color: 'var(--muted)' }}>
          <b style={{ color: HEALTH.color }}>Attention:</b> {healthReasons.join(' · ')}
        </div>
      )}

      {/* ── Account snapshot as the unified KPI strip ── */}
      <KpiRow items={[
        { label: 'Open pipeline', value: `AED ${aed(summary.pipelineValue)}`, tone: 'accent' },
        { label: 'Active opps', value: String(summary.activeOpportunities) },
        { label: 'Contracted', value: `AED ${aed(summary.wonValue)}`, tone: 'accent' },
        { label: 'Active contracts', value: `${activeContracts.length} / ${contracts.length}` },
        { label: 'Active projects', value: `${activeProjects.length} / ${projects.length}` },
        { label: 'Open tenders', value: `${summary.openTenders} / ${summary.tenderCount}` },
        { label: 'Quotations', value: String(summary.quotationCount) },
        { label: 'Outstanding AR', value: `AED ${aed(summary.outstandingReceivables)}`, tone: receivables.overdue > 0 ? 'bad' : 'neutral' },
      ] as KpiItem[]} />

      {/* ── Universal Object Shell — Situation / Health / Missing / Next Best Action ── */}
      <SituationBand
        situation={situationText}
        health={bandHealth}
        missing={missing}
        action={nba}
        outcome={{ onSelect: logOutcome, busy, note: outcomeNote }}
      />

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

      {/* ── Tabs (shared record-shell) ── */}
      <RecordTabs tabs={TABS as unknown as TabDef[]} active={tab} onChange={(id) => setTab(id as Tab)} />
      <div style={{ marginTop: 4 }} />

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

            {/* §26 — what the customer HAS, whose it is, and what to sell next */}
            <div style={{ ...st.oCard, gridColumn: '1 / -1' }}>
              <div style={st.oTitle}>Installed Base &amp; White Space</div>
              <InstalledBasePanel accountId={a.id} />
            </div>

            {/* Key contacts */}
            <div style={st.oCard}>
              <div style={st.oTitle}>Key Contacts</div>
              {contacts.length === 0 ? (
                <p style={st.oMuted}>No contacts yet — <button type="button" onClick={() => setTab('contacts')} style={{ ...st.rowLink, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>add the people you deal with →</button></p>
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
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, margin: '0 0 12px' }}>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, maxWidth: 640 }}>
                The stakeholder map — everyone involved in the buying decision at {a.name}, by role and relationship
                strength. Add, edit and manage the people right here; the ★ primary contact shows on the account header.
              </p>
              <div style={{ flexShrink: 0 }}>
                <CreateDrawer
                  entity="Contact"
                  buttonLabel="Add contact"
                  subtitle={`A person at ${a.name} — added straight to this account.`}
                  endpoint="/api/crm/contacts"
                  fields={contactFields()}
                  initialValues={{ accountId: a.id }}
                  onSaved={() => void load()}
                />
              </div>
            </div>
            {contacts.length === 0 ? (
              <p style={{ color: 'var(--muted)', margin: 0, padding: '8px 0' }}>No contacts yet — add the people you deal with at this client.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr>
                    {['', 'Name', 'Title', 'Stakeholder role', 'Relationship', 'Reports to', 'Email', 'Actions'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[...contacts].sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary)).map((c) => {
                      const isActive = c.status !== 'inactive';
                      const td = { padding: '9px 10px', borderBottom: '1px solid var(--border)' } as CSSProperties;
                      return (
                      <tr key={c.id} style={isActive ? undefined : { opacity: 0.55 }}>
                        <td style={{ ...td, color: 'var(--accent)' }}>
                          <button
                            type="button"
                            title={c.isPrimary ? 'Primary contact — click to unset' : 'Make primary contact (demotes the current one)'}
                            disabled={busy}
                            onClick={() => void patchContact(c.id, { isPrimary: !c.isPrimary })}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15, color: c.isPrimary ? 'var(--accent)' : 'var(--muted)', padding: 0, lineHeight: 1 }}
                          >
                            {c.isPrimary ? '★' : '☆'}
                          </button>
                        </td>
                        <td style={td}>
                          <a href={`/crm/contacts/${c.id}`} style={st.rowLink}>{c.name}</a>
                        </td>
                        <td style={{ ...td, color: 'var(--muted)' }}>{c.jobTitle ?? c.role ?? '—'}</td>
                        <td style={td}>
                          {c.stakeholderRole ? <span style={{ fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px' }}>{STAKEHOLDER_ROLE_LABEL[c.stakeholderRole] ?? c.stakeholderRole}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        <td style={{ ...td, fontWeight: 700, color: c.relationshipStrength ? STRENGTH_COLOR[c.relationshipStrength] ?? 'var(--muted)' : 'var(--muted)' }}>
                          {c.relationshipStrength ? STRENGTH_LABEL[c.relationshipStrength] ?? c.relationshipStrength : '—'}
                        </td>
                        <td style={{ ...td, color: 'var(--muted)' }}>
                          {c.reportsToId ? contacts.find((p) => p.id === c.reportsToId)?.name ?? '—' : '—'}
                        </td>
                        <td style={td}>{c.email ? <a href={`mailto:${c.email}`} style={st.rowLink}>{c.email}</a> : '—'}</td>
                        <td style={td}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {c.email && <a href={`mailto:${c.email}`} title="Email" style={st.rowLink}>✉</a>}
                            {c.phone && <a href={`tel:${c.phone}`} title="Call" style={st.rowLink}>☎</a>}
                            <CreateDrawer
                              entity="Contact"
                              mode="edit"
                              subtitle="Update this person's details."
                              endpoint={`/api/crm/contacts/${c.id}`}
                              fields={contactFields(c.id)}
                              initialValues={{
                                name: c.name,
                                jobTitle: c.jobTitle ?? '',
                                accountId: a.id,
                                stakeholderRole: c.stakeholderRole ?? '',
                                relationshipStrength: c.relationshipStrength ?? '',
                                reportsToId: c.reportsToId ?? '',
                                email: c.email ?? '',
                                phone: c.phone ?? '',
                              }}
                              onSaved={() => void load()}
                            />
                            <button
                              type="button"
                              title={isActive ? 'Deactivate — the person has left / is no longer a contact' : 'Reactivate this contact'}
                              disabled={busy}
                              onClick={() => void patchContact(c.id, { status: isActive ? 'inactive' : 'active' })}
                              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, color: 'var(--muted)', padding: '3px 8px' }}
                            >
                              {isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
      fontSize: 11.5, textTransform: 'capitalize', borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '2px 9px',
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
  ownerSelect: { border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', borderRadius: 6, padding: '2px 6px', fontSize: 11.5, cursor: 'pointer', maxWidth: 200 } as CSSProperties,
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
