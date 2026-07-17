'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { opportunityAttention } from '@aura/shared';
import CreateDrawer from './ui/create-drawer';
import LeadConvertDrawer from './lead-convert-drawer';

// CRM · Sales Pipeline — the full sales cycle, with Lead and Opportunity kept
// as SEPARATE concepts that share one board:
//
//   Lead (new → qualified) → Opportunity (qualification → proposal → negotiation) → Won / Lost
//
// After Won the deal chain is OPTIONAL per deal: `requiresTender` decides whether
// a Tender/Estimation is auto-created; direct sales / AMC renewals / variations
// convert straight to a quotation instead.

interface Lead {
  id: string; name: string; companyName: string | null; email: string | null;
  phone: string | null; status: string; source: string | null; createdAt: string;
}
interface Opportunity {
  id: string; leadId: string | null; accountId: string | null; accountName: string | null;
  title: string; value: number; stage: string; winProbability: number; closeDate: string | null;
  requiresTender?: boolean; ownerId?: string | null; nextAction?: string | null;
  nextActionDueDate?: string | null; createdAt: string;
}
interface Account { id: string; name: string; }
interface Activity {
  id: string; type: string; subject: string; status: string;
  relatedType: string | null; dueDate: string | null; createdAt: string;
}

const OPP_STAGES = ['qualification', 'proposal', 'negotiation', 'won', 'lost'] as const;
const ACTIVE_STAGES = ['qualification', 'proposal', 'negotiation'];
const GAP_LABEL: Record<string, string> = {
  'no-next-action': 'no next step', 'no-owner': 'no owner', 'no-due-date': 'no due date', overdue: 'overdue',
};
const SOURCES = ['website', 'referral', 'campaign', 'cold_call', 'other'] as const;

const money = (n: number): string => (n ? 'AED ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString();

export type View = 'command' | 'board' | 'analytics' | 'sources' | 'executive' | 'list' | 'activities';

/** C5 / G15 (§29) — Source → Wins → Contract Value → Actual Margin. Every money field names the
 * subset it was measured over; nulls mean "not measured yet", never zero. */
interface SourceMargin {
  source: string;
  opportunities: number;
  won: number;
  wonValue: number;
  lost: number;
  open: number;
  winRate: number | null;
  contractValue: number;
  contracted: number;
  measured: number;
  measuredRevenue: number;
  actualCost: number | null;
  actualMargin: number | null;
  marginPercent: number | null;
  measurementNote: string;
}
/** C6 (§7 exec) — why we win, why we lose, and how exposed the book is. Deliberately does NOT
 * repeat owner performance: the Overview tab owns that, and one owner may not have two win rates. */
interface ReasonRow { reason: string | null; deals: number; value: number; percent: number }
interface ExecutiveCrm {
  period: { days: number; from: string };
  decided: { won: number; lost: number; wonValue: number; lostValue: number; winRate: number | null; valueWinRate: number | null };
  winReasons: ReasonRow[];
  lossReasons: ReasonRow[];
  competitors: Array<{ name: string; lostDeals: number; lostValue: number }>;
  concentration: {
    top: Array<{ accountId: string; accountName: string; wonValue: number; percent: number }>;
    topAccountPercent: number | null;
    topThreePercent: number | null;
    accounts: number;
  };
  coverage: { winsWithoutReason: number; lossesWithoutReason: number; decidedWithoutAccount: number };
}

interface SourceFunnel {
  sources: SourceMargin[];
  totals: {
    opportunities: number; won: number; wonValue: number; contractValue: number;
    measured: number; measuredRevenue: number; actualCost: number | null;
    actualMargin: number | null; marginPercent: number | null;
  };
  coverage: { wonNotContracted: number; contractedNotMeasured: number; measuredPercent: number | null };
}

interface PipelineCommand {
  kpis: { openDeals: number; openValue: number; weighted: number; avgDealSize: number; avgAgeDays: number; winRate: number | null; won90: number; wonValue90: number; lost90: number };
  /** §23 — PIPELINE / BEST_CASE / COMMIT / CLOSED, always all four. */
  categories: Array<{ category: string; deals: number; value: number; weighted: number }>;
  forecastByMonth: Array<{ month: string; deals: number; value: number; weighted: number }>;
  aging: Array<{ key: string; label: string; deals: number; value: number }>;
  stalled: Array<{ id: string; title: string; value: number; stage: string; ownerId: string | null; accountName: string | null; daysSinceActivity: number | null }>;
  owners: Array<{ ownerId: string; openDeals: number; openValue: number; weighted: number; wonValue90: number; won90: number; lost90: number; winRate: number | null }>;
  atRisk: Array<{ id: string; title: string; value: number; stage: string; ownerId: string | null; accountName: string | null; reasons: string[]; recommendation: string; daysSinceActivity: number | null }>;
}

interface ForecastHistory {
  captures: Array<{ batchId: string; takenAt: string; totalOpen: number; totalWeighted: number; totalCommitted: number; totalDeals: number }>;
  latestDiff: {
    hasPrior: boolean; takenAtPrev: string | null; takenAtCurr: string | null;
    totals: { prevWeighted: number; currWeighted: number; weightedDelta: number; prevDeals: number; currDeals: number; dealDelta: number };
    byPeriod: Array<{ period: string; prevWeighted: number; currWeighted: number; weightedDelta: number; prevDeals: number; currDeals: number; dealDelta: number }>;
    slippedValue: number; reasons: string[];
  };
}

export default function CrmPipelineClient({ initialLeads, initialOpportunities, initialAccounts, view: controlledView, onViewChange }: {
  initialLeads: Lead[]; initialOpportunities: Opportunity[]; initialAccounts: Account[];
  /** When provided the workspace owns the tab bar — internal switcher hides, navigation delegates up. */
  view?: View; onViewChange?: (v: View) => void;
}) {
  const router = useRouter();
  const [internalView, setInternalView] = useState<View>('command');
  const view = controlledView ?? internalView;
  const setView = (v: View): void => { if (onViewChange) onViewChange(v); else setInternalView(v); };
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forecast, setForecast] = useState<{ id: string; prob: number; reason: string } | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [command, setCommand] = useState<PipelineCommand | null>(null);
  const [fcast, setFcast] = useState<ForecastHistory | null>(null);
  const [funnel, setFunnel] = useState<SourceFunnel | null>(null);
  const [execDays, setExecDays] = useState(365);
  const [execData, setExecData] = useState<ExecutiveCrm | null>(null);

  useEffect(() => {
    if ((view !== 'command' && view !== 'analytics') || command) return;
    void fetch('/api/crm/opportunities/pipeline', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCommand(d))
      .catch(() => setCommand(null));
  }, [view, command]);

  const loadForecast = (): void => {
    void fetch('/api/crm/opportunities/forecast', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFcast(d))
      .catch(() => setFcast(null));
  };
  useEffect(() => {
    if (view !== 'executive') return;
    setExecData(null);
    void fetch(`/api/crm/executive?days=${execDays}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setExecData(d))
      .catch(() => setExecData(null));
  }, [view, execDays]);

  useEffect(() => {
    if (view !== 'sources' || funnel) return;
    void fetch('/api/crm/source-funnel', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFunnel(d))
      .catch(() => setFunnel(null));
  }, [view, funnel]);

  useEffect(() => {
    if (view !== 'analytics' || fcast) return;
    loadForecast();
  }, [view, fcast]);

  const captureSnapshot = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/crm/opportunities/forecast', { method: 'POST' });
      if (res.ok) { setMsg('Forecast snapshot captured — slippage will show against the next capture.'); loadForecast(); }
      else { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? 'Capture failed'); }
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };
  // Native HTML5 drag & drop across board columns (buttons stay as the
  // keyboard-accessible fallback for the same moves).
  const [drag, setDrag] = useState<{ kind: 'lead' | 'opp'; id: string; from: string } | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);

  useEffect(() => {
    if (view !== 'activities' || activities) return;
    void (async () => {
      const res = await fetch('/api/crm/activities', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setActivities(Array.isArray(d) ? d : (d.items ?? []));
      } else setActivities([]);
    })();
  }, [view, activities]);

  async function call(path: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Request failed');
        return false;
      }
      router.refresh();
      return true;
    } catch { setErr('API unreachable'); return false; } finally { setBusy(false); }
  }

  const changeStage = (o: Opportunity, stage: string): void => {
    setMsg(null);
    void call(`/api/crm/opportunities/${o.id}`, 'PATCH', { stage }).then((ok) => {
      if (ok && stage === 'won') {
        setMsg(o.requiresTender === false
          ? `"${o.title}" won — direct-sale path (no tender). Convert it to a quotation when ready.`
          : `"${o.title}" won — a draft tender is being created (tender path).`);
      }
    });
  };

  const toggleTenderPath = (o: Opportunity): void => {
    void call(`/api/crm/opportunities/${o.id}`, 'PATCH', { requiresTender: !(o.requiresTender ?? true) });
  };

  const qualifyLead = (l: Lead): void => { void call(`/api/crm/leads/${l.id}`, 'PATCH', { status: 'qualified' }); };

  // Quick convert (used by drag-to-Discovery): the proper transactional convert with
  // auto-resolution — links the Account/Contact on an EXACT match, else creates them.
  // The reviewable link-vs-create choice lives in <LeadConvertDrawer/> on the card.
  const convertLead = (l: Lead): void => {
    setMsg(null); setErr(null);
    void (async () => {
      const res = await fetch(`/api/crm/leads/${l.id}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Convert failed'); return; }
      const acc = d.account?.action === 'created' ? 'new account created' : 'linked to its account';
      setMsg(`Lead "${l.name}" converted — ${acc}, primary contact set, opportunity opened.`);
      router.refresh();
    })();
  };

  const convertToQuotation = (o: Opportunity): void => {
    setMsg(null);
    void (async () => {
      const res = await fetch(`/api/crm/opportunities/${o.id}/convert-to-quotation`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.message ?? d.error ?? 'Convert failed');
      else setMsg(`Quotation ${d.quoteNumber} drafted from "${o.title}" — review it in CRM · Quotations.`);
    })();
  };

  async function runForecast(id: string): Promise<void> {
    setBusy(true); setErr(null); setForecast(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${id}/forecast`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setForecast({ id, prob: data.winProbability, reason: data.reason });
      else setErr(data.error ?? 'Forecast failed');
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  /** Which columns the current drag may drop on. */
  const canDrop = (colKey: string): boolean => {
    if (!drag) return false;
    if (drag.kind === 'opp') return OPP_STAGES.includes(colKey as (typeof OPP_STAGES)[number]) && colKey !== drag.from;
    // leads: new → Qualified Leads column; qualified → Discovery (converts to an opportunity)
    if (drag.from !== 'qualified') return colKey === 'lead-qualified';
    return colKey === 'qualification';
  };

  const onDropTo = (colKey: string): void => {
    if (!drag || !canDrop(colKey)) return;
    const d = drag;
    setDrag(null);
    setHoverCol(null);
    if (d.kind === 'opp') {
      const o = initialOpportunities.find((x) => x.id === d.id);
      if (o) changeStage(o, colKey);
      return;
    }
    const l = initialLeads.find((x) => x.id === d.id);
    if (!l) return;
    if (colKey === 'lead-qualified') qualifyLead(l);
    else convertLead(l);
  };

  const dragHandlers = (kind: 'lead' | 'opp', id: string, from: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id); // required by Firefox to start a drag
      setDrag({ kind, id, from });
    },
    onDragEnd: () => {
      setDrag(null);
      setHoverCol(null);
    },
  });

  const dropHandlers = (colKey: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canDrop(colKey)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (hoverCol !== colKey) setHoverCol(colKey);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget === e.target && hoverCol === colKey) setHoverCol(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onDropTo(colKey);
    },
  });

  /* ── KPIs (leads and opportunities counted separately) ─────────────────── */
  const leads = initialLeads;
  const opps = initialOpportunities;
  const activeLeads = leads.filter((l) => l.status !== 'disqualified');
  const qualifiedLeads = leads.filter((l) => l.status === 'qualified');
  const activeOpps = opps.filter((o) => ACTIVE_STAGES.includes(o.stage));
  const wonOpps = opps.filter((o) => o.stage === 'won');
  const lostOpps = opps.filter((o) => o.stage === 'lost');
  const pipelineValue = activeOpps.reduce((s, o) => s + o.value, 0);
  const weighted = activeOpps.reduce((s, o) => s + o.value * (o.winProbability / 100), 0);
  const wonValue = wonOpps.reduce((s, o) => s + o.value, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const wonThisMonth = wonOpps.filter((o) => (o.closeDate ?? o.createdAt).slice(0, 7) === thisMonth);
  const winRate = wonOpps.length + lostOpps.length > 0 ? Math.round((wonOpps.length / (wonOpps.length + lostOpps.length)) * 100) : null;

  /* ── board columns: leads first, then opportunity stages ───────────────── */
  const boardCols: Array<{ key: string; label: string; kind: 'lead' | 'opp'; leads?: Lead[]; opps?: Opportunity[] }> = [
    { key: 'lead-new', label: 'New Leads', kind: 'lead', leads: activeLeads.filter((l) => l.status !== 'qualified') },
    { key: 'lead-qualified', label: 'Qualified Leads', kind: 'lead', leads: qualifiedLeads },
    { key: 'qualification', label: 'Discovery', kind: 'opp', opps: opps.filter((o) => o.stage === 'qualification') },
    { key: 'proposal', label: 'Proposal', kind: 'opp', opps: opps.filter((o) => o.stage === 'proposal') },
    { key: 'negotiation', label: 'Negotiation', kind: 'opp', opps: opps.filter((o) => o.stage === 'negotiation') },
    { key: 'won', label: 'Won', kind: 'opp', opps: wonOpps },
    { key: 'lost', label: 'Lost', kind: 'opp', opps: lostOpps },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && <div style={s.errorBar}>{err}</div>}
      {msg && <div style={s.okBar}>{msg}</div>}

      {/* KPI strip — leads and opportunities are SEPARATE counts */}
      <div style={s.kpiStrip}>
        <Kpi label="Total Leads" value={String(activeLeads.length)} />
        <Kpi label="Qualified Leads" value={String(qualifiedLeads.length)} />
        <Kpi label="Active Opportunities" value={String(activeOpps.length)} />
        <Kpi label="Pipeline Value" value={money(pipelineValue)} />
        <Kpi label="Weighted Forecast" value={money(weighted)} accent />
        <Kpi label="Won Value" value={money(wonValue)} good />
        <Kpi label="Won This Month" value={`${wonThisMonth.length} · ${money(wonThisMonth.reduce((x, o) => x + o.value, 0))}`} good />
        <Kpi label="Win Rate" value={winRate === null ? '—' : `${winRate}%`} accent />
      </div>

      {/* view switch + creates (switcher hides when the workspace owns the tabs) */}
      <div style={s.tabBar}>
        {!controlledView && (['command', 'board', 'analytics', 'sources', 'executive', 'list', 'activities'] as View[]).map((v) => (
          <button key={v} type="button" style={view === v ? s.tabActive : s.tab} onClick={() => setView(v)}>
            {v === 'command' ? 'Overview' : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <CreateDrawer
          entity="Lead"
          subtitle="Account-first: name the account, add the person you deal with, capture the interest — then Qualify & Convert links it all and opens an Opportunity."
          endpoint="/api/crm/leads"
          fields={[
            // 1 · Account — the party. Pick an existing one (fills the name so Qualify & Convert
            // auto-links it) or type a brand-new prospect. The hard link forms at conversion.
            {
              name: '_existingAccount', label: 'Existing account (optional)', kind: 'select', span: 2,
              placeholder: 'Search accounts…', hint: 'Or leave blank and type a new company below.',
              options: initialAccounts.map((a) => ({ value: a.id, label: a.name, fills: { companyName: a.name } })),
            },
            { name: 'companyName', label: 'Company / account', kind: 'text', span: 2, placeholder: 'e.g. Nakheel' },
            // 2 · Primary Contact — the person inside that account.
            { name: 'name', label: 'Primary contact', kind: 'text', required: true, span: 2, placeholder: 'e.g. Fatima Al Zaabi' },
            { name: 'email', label: 'Email', kind: 'text', placeholder: 'name@company.com' },
            { name: 'phone', label: 'Phone', kind: 'text', placeholder: '+971 …' },
            // 3 · Lead info — source, interest, expected value.
            { name: 'source', label: 'Source', kind: 'select', defaultValue: 'website', options: SOURCES.map((src) => ({ value: src, label: src.replace('_', ' ') })) },
            { name: 'estimatedValue', label: 'Expected value (AED)', kind: 'number', placeholder: '0' },
            { name: 'requirement', label: 'Interest / requirement', kind: 'textarea', span: 2, placeholder: 'What are they interested in? e.g. CCTV + access control for 3 towers' },
          ]}
        />
        <CreateDrawer
          entity="Opportunity"
          subtitle="A qualified deal. Choose its path: tender/estimation, or direct sale (straight to quotation)."
          endpoint="/api/crm/opportunities"
          fields={[
            { name: 'title', label: 'Opportunity title', kind: 'text', required: true, placeholder: 'e.g. Downtown HQ — security systems', span: 2 },
            { name: 'value', label: 'Value (AED)', kind: 'number', placeholder: '0' },
            { name: 'winProbability', label: 'Win probability %', kind: 'number', placeholder: '20' },
            { name: 'closeDate', label: 'Expected close', kind: 'date' },
            {
              name: 'accountId', label: 'Account', kind: 'select', labelField: 'accountName',
              placeholder: 'No linked account', options: initialAccounts.map((a) => ({ value: a.id, label: a.name })),
            },
            { name: 'leadId', label: 'Lead', kind: 'select', placeholder: 'No linked lead', options: initialLeads.map((l) => ({ value: l.id, label: l.name })) },
            {
              name: 'requiresTender', label: 'Path after winning', kind: 'select', defaultValue: 'true',
              hint: 'Tender path auto-creates a tender on win; direct sale goes straight to a quotation.',
              options: [
                { value: 'true', label: 'Tender / estimation' },
                { value: 'false', label: 'Direct sale (no tender)' },
              ],
            },
            { name: 'ownerId', label: 'Owner', kind: 'text', placeholder: 'e.g. u-sales' },
            {
              name: 'source', label: 'Source', kind: 'select', placeholder: 'Where did it come from?',
              options: [
                { value: 'referral', label: 'Referral' },
                { value: 'existing_client', label: 'Existing client' },
                { value: 'campaign', label: 'Campaign' },
                { value: 'cold_call', label: 'Cold call' },
                { value: 'website', label: 'Website' },
                { value: 'other', label: 'Other' },
              ],
            },
            { name: 'competitors', label: 'Competitors', kind: 'text', placeholder: 'e.g. Rival ELV LLC, Acme Systems', span: 2, hint: 'Comma-separated — who else is bidding' },
            { name: 'nextAction', label: 'Next action', kind: 'text', placeholder: 'e.g. Site survey Sunday' },
            { name: 'nextActionDueDate', label: 'Next action due', kind: 'date', hint: 'Active deals need a next step, an owner & a due date — else they show as Needs Attention' },
          ]}
        />
      </div>

      {/* ── COMMAND ── the sales manager's cockpit */}
      {view === 'command' && (
        command === null ? <p style={s.muted}>Loading the pipeline command center…</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* portfolio KPIs */}
            <div style={s.cmdKpiRow}>
              <CmdKpi label="Open pipeline" value={money(command.kpis.openValue)} />
              <CmdKpi label="Weighted forecast" value={money(command.kpis.weighted)} accent />
              <CmdKpi label="Open deals" value={String(command.kpis.openDeals)} />
              <CmdKpi label="Avg deal size" value={money(command.kpis.avgDealSize)} />
              <CmdKpi label="Avg age" value={`${command.kpis.avgAgeDays}d`} />
              <CmdKpi label="Win rate (90d)" value={command.kpis.winRate === null ? '—' : `${command.kpis.winRate}%`} accent />
              <CmdKpi label="Won (90d)" value={`${command.kpis.won90} · ${money(command.kpis.wonValue90)}`} good />
              <CmdKpi label="At risk" value={String(command.atRisk.length)} bad={command.atRisk.length > 0} />
            </div>

            {/* §23 forecast categories — the management commitment ladder */}
            {command.categories && (
              <div style={s.cmdKpiRow}>
                {command.categories.map((c) => (
                  <CmdKpi
                    key={c.category}
                    label={c.category === 'BEST_CASE' ? 'Best case' : c.category.charAt(0) + c.category.slice(1).toLowerCase()}
                    value={`${c.deals} · ${money(c.value)}`}
                    accent={c.category === 'COMMIT'}
                    good={c.category === 'CLOSED'}
                  />
                ))}
              </div>
            )}

            <div style={s.cmdGrid}>
              {/* At-risk deals + recommendations */}
              <section style={{ ...s.cmdCard, gridColumn: '1 / -1' }}>
                <div style={s.cmdTitle}>⚠ At-risk deals — {command.atRisk.length}</div>
                {command.atRisk.length === 0 ? <p style={s.muted}>No at-risk deals — the pipeline is healthy.</p> : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead><tr>{['Deal', 'Value', 'Stage', 'Owner', 'Why at risk', 'Recommended next step'].map((h) => <th key={h} style={s.cmdTh}>{h}</th>)}</tr></thead>
                      <tbody>
                        {command.atRisk.slice(0, 12).map((d) => (
                          <tr key={d.id}>
                            <td style={s.cmdTd}><a href={`/crm/opportunities/${d.id}`} style={s.link}>{d.title}</a>{d.accountName && <div style={s.cmdSub}>{d.accountName}</div>}</td>
                            <td style={{ ...s.cmdTd, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(d.value)}</td>
                            <td style={{ ...s.cmdTd, textTransform: 'capitalize' }}>{d.stage}</td>
                            <td style={s.cmdTd}>{d.ownerId ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                            <td style={s.cmdTd}>{d.reasons.map((r) => <span key={r} style={s.riskChip}>{r}</span>)}</td>
                            <td style={{ ...s.cmdTd, color: 'var(--accent)', fontWeight: 600 }}>{d.recommendation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

            </div>
            <p style={s.muted}>Work deals on the <button type="button" style={s.linkBtn} onClick={() => setView('board')}>Board</button> · deep-dive in <button type="button" style={s.linkBtn} onClick={() => setView('analytics')}>Analytics</button> (aging, owner performance, forecast by month & stalled deals).</p>
          </div>
        )
      )}

      {/* ── ANALYTICS ── the deep-dive, moved off the Overview to keep it focused */}
      {view === 'analytics' && (
        command === null ? <p style={s.muted}>Loading analytics…</p> : (
          <div style={s.cmdGrid}>
            {/* Pipeline aging */}
            <section style={s.cmdCard}>
              <div style={s.cmdTitle}>Pipeline aging</div>
              {command.aging.map((a) => {
                const max = Math.max(1, ...command.aging.map((x) => x.value));
                return (
                  <div key={a.key} style={{ marginBottom: 8 }}>
                    <div style={s.agingRow}><span>{a.label}</span><span style={{ color: 'var(--muted)' }}>{a.deals} · {money(a.value)}</span></div>
                    <div style={s.agingTrack}><div style={{ ...s.agingFill, width: `${(a.value / max) * 100}%`, background: a.key === 'stale' ? 'var(--bad)' : a.key === 'aging' ? 'var(--warn, #d97706)' : 'var(--accent)' }} /></div>
                  </div>
                );
              })}
            </section>

            {/* Owner performance */}
            <section style={s.cmdCard}>
              <div style={s.cmdTitle}>Owner performance</div>
              {command.owners.length === 0 ? <p style={s.muted}>No open deals.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr>{['Owner', 'Open', 'Weighted', 'Win rate'].map((h) => <th key={h} style={s.cmdTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {command.owners.map((o) => (
                      <tr key={o.ownerId}>
                        <td style={s.cmdTd}>{o.ownerId === 'unassigned' ? <span style={{ color: 'var(--muted)' }}>Unassigned</span> : o.ownerId}</td>
                        <td style={s.cmdTd}>{o.openDeals} · {money(o.openValue)}</td>
                        <td style={{ ...s.cmdTd, color: 'var(--accent)', fontWeight: 700 }}>{money(o.weighted)}</td>
                        <td style={s.cmdTd}>{o.winRate === null ? '—' : `${o.winRate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Weighted forecast by month */}
            <section style={s.cmdCard}>
              <div style={s.cmdTitle}>Weighted forecast by close month</div>
              {command.forecastByMonth.length === 0 ? <p style={s.muted}>No active opportunities.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr>{['Month', 'Deals', 'Value', 'Weighted'].map((h) => <th key={h} style={s.cmdTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {command.forecastByMonth.map((f) => (
                      <tr key={f.month}>
                        <td style={s.cmdTd}>{f.month === 'unscheduled' ? 'Unscheduled' : f.month}</td>
                        <td style={s.cmdTd}>{f.deals}</td>
                        <td style={s.cmdTd}>{money(f.value)}</td>
                        <td style={{ ...s.cmdTd, color: 'var(--accent)', fontWeight: 700 }}>{money(f.weighted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Forecast slippage — snapshots over time */}
            <section style={{ ...s.cmdCard, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div style={{ ...s.cmdTitle, marginBottom: 0 }}>Forecast slippage</div>
                <button type="button" style={s.btnSec} disabled={busy} onClick={() => void captureSnapshot()}>📸 Capture snapshot</button>
              </div>
              {fcast === null ? <p style={s.muted}>Loading forecast history…</p>
                : fcast.captures.length === 0 ? <p style={s.muted}>No snapshots yet — capture one to start tracking how the forecast moves week over week.</p>
                : (
                  <>
                    {!fcast.latestDiff.hasPrior
                      ? <p style={s.muted}>One snapshot on record (captured {fmt(fcast.captures[0].takenAt)}). Capture again later to see slippage.</p>
                      : (
                        <>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                            <span style={s.slipTotal}>
                              Weighted {fcast.latestDiff.totals.weightedDelta >= 0 ? '▲' : '▼'} {money(Math.abs(fcast.latestDiff.totals.weightedDelta))}
                            </span>
                            {fcast.latestDiff.slippedValue > 0 && <span style={s.riskChip}>slipped {money(fcast.latestDiff.slippedValue)}</span>}
                            {fcast.latestDiff.reasons.map((r) => <span key={r} style={s.slipChip}>{r}</span>)}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead><tr>{['Month', 'Prev weighted', 'Now weighted', 'Δ', 'Deals Δ'].map((h) => <th key={h} style={s.cmdTh}>{h}</th>)}</tr></thead>
                            <tbody>
                              {fcast.latestDiff.byPeriod.map((p) => (
                                <tr key={p.period}>
                                  <td style={s.cmdTd}>{p.period === 'unscheduled' ? 'Unscheduled' : p.period}</td>
                                  <td style={s.cmdTd}>{money(p.prevWeighted)}</td>
                                  <td style={s.cmdTd}>{money(p.currWeighted)}</td>
                                  <td style={{ ...s.cmdTd, fontWeight: 700, color: p.weightedDelta < 0 ? 'var(--bad)' : p.weightedDelta > 0 ? 'var(--good)' : 'var(--muted)' }}>
                                    {p.weightedDelta === 0 ? '—' : `${p.weightedDelta > 0 ? '+' : ''}${money(p.weightedDelta)}`}
                                  </td>
                                  <td style={{ ...s.cmdTd, color: p.dealDelta < 0 ? 'var(--bad)' : p.dealDelta > 0 ? 'var(--good)' : 'var(--muted)' }}>
                                    {p.dealDelta === 0 ? '—' : `${p.dealDelta > 0 ? '+' : ''}${p.dealDelta}`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    <p style={{ ...s.muted, padding: '8px 0 0', fontSize: 11.5 }}>{fcast.captures.length} snapshot{fcast.captures.length === 1 ? '' : 's'} on record · latest {fmt(fcast.captures[0].takenAt)}</p>
                  </>
                )}
            </section>

            {/* Stalled deals */}
            <section style={s.cmdCard}>
              <div style={s.cmdTitle}>Stalled deals — {command.stalled.length}</div>
              {command.stalled.length === 0 ? <p style={s.muted}>Nothing stalled — every deal has recent movement.</p> : (
                command.stalled.slice(0, 8).map((d) => (
                  <div key={d.id} style={s.stalledRow}>
                    <a href={`/crm/opportunities/${d.id}`} style={s.link}>{d.title}</a>
                    <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{money(d.value)} · {d.daysSinceActivity === null ? 'never touched' : `quiet ${d.daysSinceActivity}d`}</span>
                  </div>
                ))
              )}
            </section>
          </div>
        )
      )}

      {/* ── EXECUTIVE (C6, §7) ── */}
      {view === 'executive' && (
        execData === null ? <p style={s.muted}>Loading the executive read…</p> : (
          <div style={s.cmdGrid}>
            <section style={{ ...s.cmdCard, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <div style={s.cmdTitle}>Decided in the last {execData.period.days} days</div>
                <div style={{ flex: 1 }} />
                {[90, 365, 730].map((d) => (
                  <button key={d} type="button" style={execDays === d ? s.tabActive : s.tab} onClick={() => setExecDays(d)}>
                    {d === 365 ? '1 year' : d === 730 ? '2 years' : '90 days'}
                  </button>
                ))}
              </div>
              <div style={s.cmdKpiRow}>
                <div style={s.cmdKpi}>
                  <span style={s.kpiLabel}>Won</span>
                  <span style={s.kpiVal}>{execData.decided.won} · {money(execData.decided.wonValue)}</span>
                </div>
                <div style={s.cmdKpi}>
                  <span style={s.kpiLabel}>Lost</span>
                  <span style={s.kpiVal}>{execData.decided.lost} · {money(execData.decided.lostValue)}</span>
                </div>
                <div style={s.cmdKpi}>
                  <span style={s.kpiLabel}>Win rate (deals)</span>
                  <span style={s.kpiVal}>{execData.decided.winRate === null ? '—' : `${execData.decided.winRate}%`}</span>
                </div>
                {/* Winning the small ones is not winning — the value rate is the honest second number. */}
                <div style={s.cmdKpi}>
                  <span style={s.kpiLabel}>Win rate (value)</span>
                  <span style={{ ...s.kpiVal, color: 'var(--accent)' }}>
                    {execData.decided.valueWinRate === null ? '—' : `${execData.decided.valueWinRate}%`}
                  </span>
                </div>
              </div>
            </section>

            <section style={s.cmdCard}>
              <div style={s.cmdTitle}>Why we win</div>
              {execData.winReasons.length === 0 ? <p style={s.muted}>Nothing won in this window.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr>{['Reason', 'Deals', 'Value'].map((h) => <th key={h} style={s.cmdTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {execData.winReasons.map((r) => (
                      <tr key={r.reason ?? 'unrecorded'}>
                        <td style={s.cmdTd}>
                          {r.reason ?? <span style={{ color: 'var(--bad)' }}>not recorded</span>}
                        </td>
                        <td style={s.cmdTd}>{r.deals} · {r.percent}%</td>
                        <td style={s.cmdTd}>{money(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={s.cmdCard}>
              <div style={s.cmdTitle}>Why we lose</div>
              {execData.lossReasons.length === 0 ? <p style={s.muted}>Nothing lost in this window.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr>{['Reason', 'Deals', 'Value'].map((h) => <th key={h} style={s.cmdTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {execData.lossReasons.map((r) => (
                      <tr key={r.reason ?? 'unrecorded'}>
                        <td style={s.cmdTd}>
                          {r.reason ?? <span style={{ color: 'var(--bad)' }}>not recorded</span>}
                        </td>
                        <td style={s.cmdTd}>{r.deals} · {r.percent}%</td>
                        <td style={s.cmdTd}>{money(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={s.cmdCard}>
              <div style={s.cmdTitle}>Named on deals we lost</div>
              {execData.competitors.length === 0 ? <p style={s.muted}>No competitors named on any loss.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr>{['Competitor', 'Losses', 'Value'].map((h) => <th key={h} style={s.cmdTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {execData.competitors.map((c) => (
                      <tr key={c.name}>
                        <td style={s.cmdTd}>{c.name}</td>
                        <td style={s.cmdTd}>{c.lostDeals}</td>
                        <td style={s.cmdTd}>{money(c.lostValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p style={{ ...s.muted, padding: '8px 0 0', fontSize: 11 }}>
                Being named on a loss isn&apos;t proof they won it — it&apos;s who we said we were up against.
              </p>
            </section>

            <section style={s.cmdCard}>
              <div style={s.cmdTitle}>Revenue concentration</div>
              {execData.concentration.top.length === 0 ? <p style={s.muted}>Nothing won in this window.</p> : (
                <>
                  <p style={{ ...s.muted, padding: '0 0 8px' }}>
                    Top client is <strong>{execData.concentration.topAccountPercent}%</strong> of won value
                    {execData.concentration.topThreePercent !== null && `; top 3 are ${execData.concentration.topThreePercent}%`}
                    {' '}across {execData.concentration.accounts} account{execData.concentration.accounts === 1 ? '' : 's'}.
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead><tr>{['Account', 'Won', 'Share'].map((h) => <th key={h} style={s.cmdTh}>{h}</th>)}</tr></thead>
                    <tbody>
                      {execData.concentration.top.map((t) => (
                        <tr key={t.accountId}>
                          <td style={s.cmdTd}>{t.accountName}</td>
                          <td style={s.cmdTd}>{money(t.wonValue)}</td>
                          <td style={{ ...s.cmdTd, fontWeight: 700 }}>{t.percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>

            {(execData.coverage.winsWithoutReason > 0 ||
              execData.coverage.lossesWithoutReason > 0 ||
              execData.coverage.decidedWithoutAccount > 0) && (
              <section style={{ ...s.cmdCard, gridColumn: '1 / -1' }}>
                <div style={s.cmdTitle}>What this read could not see</div>
                <p style={{ ...s.muted, padding: 0 }}>
                  {execData.coverage.winsWithoutReason} win(s) and {execData.coverage.lossesWithoutReason} loss(es)
                  carry no recorded reason{execData.coverage.decidedWithoutAccount > 0 &&
                    `; ${execData.coverage.decidedWithoutAccount} decided deal(s) have no account, so they cannot enter the concentration table`}.
                  {' '}The percentages above are honest about the deals they can see — these are the ones they cannot.
                </p>
              </section>
            )}
          </div>
        )
      )}

      {/* ── SOURCES → MARGIN (C5 / G15, §29) ── */}
      {view === 'sources' && (
        funnel === null ? <p style={s.muted}>Loading the source funnel…</p> : (
          <div style={s.cmdGrid}>
            <section style={{ ...s.cmdCard, gridColumn: '1 / -1' }}>
              <div style={s.cmdTitle}>Source → Wins → Contract Value → Actual Margin</div>
              <p style={s.muted}>
                Margin is only ever computed over deals that were <strong>won, contracted, delivered
                and costed</strong>. A win that hasn&apos;t been delivered yet has no margin — which is
                not the same as a margin of zero, so it reads &ldquo;—&rdquo; and says why.
              </p>
              <div style={{ ...s.cmdKpiRow, marginTop: 10 }}>
                <div style={s.cmdKpi}>
                  <span style={s.kpiLabel}>Won</span>
                  <span style={s.kpiVal}>{funnel.totals.won} · {money(funnel.totals.wonValue)}</span>
                </div>
                <div style={s.cmdKpi}>
                  <span style={s.kpiLabel}>Contract value</span>
                  <span style={s.kpiVal}>{money(funnel.totals.contractValue)}</span>
                </div>
                <div style={s.cmdKpi}>
                  <span style={s.kpiLabel}>Actual margin</span>
                  <span style={{ ...s.kpiVal, color: 'var(--accent)' }}>
                    {funnel.totals.actualMargin === null ? '—' : money(funnel.totals.actualMargin)}
                    {funnel.totals.marginPercent !== null && ` · ${funnel.totals.marginPercent}%`}
                  </span>
                </div>
                <div style={s.cmdKpi}>
                  <span style={s.kpiLabel}>Margin covers</span>
                  <span style={s.kpiVal}>
                    {funnel.coverage.measuredPercent === null ? '—' : `${funnel.coverage.measuredPercent}% of wins`}
                  </span>
                </div>
              </div>
              {(funnel.coverage.wonNotContracted > 0 || funnel.coverage.contractedNotMeasured > 0) && (
                <p style={{ ...s.muted, marginTop: 8 }}>
                  Not yet measurable: {funnel.coverage.wonNotContracted} win(s) without a contract
                  {' · '}{funnel.coverage.contractedNotMeasured} contract(s) with no recorded cost.
                </p>
              )}
            </section>

            <section style={{ ...s.cmdCard, gridColumn: '1 / -1' }}>
              <div style={s.cmdTitle}>By source</div>
              {funnel.sources.length === 0 ? <p style={s.muted}>No deals yet — nothing to attribute.</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        {['Source', 'Deals', 'Won', 'Win rate', 'Contract value', 'Measured on', 'Actual cost', 'Actual margin', ''].map((h) => (
                          <th key={h} style={s.cmdTh}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {funnel.sources.map((r) => (
                        <tr key={r.source}>
                          <td style={s.cmdTd}>
                            {r.source === 'unknown' ? <span style={{ color: 'var(--muted)' }}>Unattributed</span> : r.source.replace(/_/g, ' ')}
                          </td>
                          <td style={s.cmdTd}>{r.opportunities} · {r.open} open</td>
                          <td style={s.cmdTd}>{r.won} · {money(r.wonValue)}</td>
                          <td style={s.cmdTd}>{r.winRate === null ? '—' : `${r.winRate}%`}</td>
                          <td style={s.cmdTd}>{r.contractValue > 0 ? money(r.contractValue) : '—'}</td>
                          {/* The revenue the margin is a margin ON — never the full won value. */}
                          <td style={s.cmdTd}>{r.measured > 0 ? `${r.measured} of ${r.won} · ${money(r.measuredRevenue)}` : '—'}</td>
                          <td style={s.cmdTd}>{r.actualCost === null ? '—' : money(r.actualCost)}</td>
                          <td style={{ ...s.cmdTd, fontWeight: 700, color: r.actualMargin === null ? 'var(--muted)' : r.actualMargin < 0 ? 'var(--bad)' : 'var(--accent)' }}>
                            {r.actualMargin === null ? '—' : `${money(r.actualMargin)}${r.marginPercent === null ? '' : ` · ${r.marginPercent}%`}`}
                          </td>
                          <td style={{ ...s.cmdTd, color: 'var(--muted)', fontSize: 11 }}>{r.measurementNote}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )
      )}

      {/* ── BOARD ── */}
      {view === 'board' && (
        <div style={s.board}>
          {boardCols.map((col) => (
            <div
              key={col.key}
              style={{
                ...s.col,
                ...(drag && canDrop(col.key) ? s.colDroppable : {}),
                ...(hoverCol === col.key ? s.colHover : {}),
              }}
              {...dropHandlers(col.key)}
            >
              <div style={s.colHead}>
                <span>{col.label}</span>
                <span style={s.colCount}>{col.kind === 'lead' ? col.leads!.length : col.opps!.length}</span>
              </div>
              {col.kind === 'opp' && col.opps!.length > 0 && ACTIVE_STAGES.includes(col.key) && (
                <div style={s.colValue}>{money(col.opps!.reduce((x, o) => x + o.value, 0))}</div>
              )}

              {col.kind === 'lead' && col.leads!.map((l) => (
                <div key={l.id} style={{ ...s.card, ...s.cardGrab, ...(drag?.id === l.id ? s.cardDragging : {}) }}
                  {...dragHandlers('lead', l.id, l.status)} title="Drag to qualify / convert">
                  <div style={s.cardTitle}><a href={`/crm/leads/${l.id}`} style={{ color: 'inherit', textDecoration: 'none' }} onMouseDown={(e) => e.stopPropagation()}>{l.name}</a></div>
                  {l.companyName && <div style={s.cardSub}>{l.companyName}</div>}
                  <div style={s.cardMetaRow}>
                    {l.source && <span style={s.srcTag}>{l.source.replace('_', ' ')}</span>}
                    <span style={{ ...s.srcTag, textTransform: 'capitalize' }}>{l.status}</span>
                  </div>
                  <div style={s.cardActions}>
                    {l.status !== 'qualified'
                      ? <button style={s.cardBtn} disabled={busy} onClick={() => qualifyLead(l)}>Qualify ✓</button>
                      : <LeadConvertDrawer lead={l} accounts={initialAccounts} onDone={() => { setMsg(`Lead "${l.name}" converted to an opportunity.`); router.refresh(); }} />}
                  </div>
                </div>
              ))}

              {col.kind === 'opp' && col.opps!.map((o) => {
                const stageIdx = OPP_STAGES.indexOf(o.stage as (typeof OPP_STAGES)[number]);
                const direct = o.requiresTender === false;
                const att = opportunityAttention(o);
                return (
                  <div
                    key={o.id}
                    style={{ ...s.card, ...s.cardGrab, ...(o.stage === 'won' ? s.cardWon : o.stage === 'lost' ? s.cardLost : {}), ...(drag?.id === o.id ? s.cardDragging : {}) }}
                    {...dragHandlers('opp', o.id, o.stage)}
                    title="Drag to another stage"
                  >
                    <div style={s.cardTitle}>
                      <a href={`/crm/opportunities/${o.id}`} style={{ color: 'var(--fg)', textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>{o.title}</a>
                    </div>
                    {o.accountName && <div style={s.cardSub}>{o.accountName}</div>}
                    <div style={s.cardMetaRow}>
                      <b>{money(o.value)}</b>
                      <span style={{ color: 'var(--muted)' }}>{o.winProbability}%</span>
                      {o.closeDate && <span style={{ color: 'var(--muted)' }}>⏱ {fmt(o.closeDate)}</span>}
                    </div>
                    <div style={s.probBar}><div style={{ ...s.probFill, width: `${o.winProbability}%`, background: o.winProbability >= 70 ? 'var(--good)' : o.winProbability >= 40 ? 'var(--accent)' : 'var(--bad)' }} /></div>
                    <div style={s.cardMetaRow}>
                      <button style={{ ...s.pathTag, color: direct ? 'var(--accent)' : 'var(--muted)' }} disabled={busy || o.stage === 'won' || o.stage === 'lost'}
                        title="Toggle the path after winning" onClick={() => toggleTenderPath(o)}>
                        {direct ? 'Direct sale' : 'Tender path'}
                      </button>
                      {o.ownerId && <span style={{ color: 'var(--muted)', fontSize: 11 }}>◆ {o.ownerId}</span>}
                    </div>
                    {o.nextAction && (
                      <div style={s.nextAction}>Next: {o.nextAction}{o.nextActionDueDate && ` · due ${fmt(o.nextActionDueDate)}`}</div>
                    )}
                    {att.needsAttention && (
                      <div style={s.attnBadge} title={`Next-Action Invariant unmet: ${att.gaps.map((g) => GAP_LABEL[g]).join(', ')}`}>
                        ⚠ Needs attention — {att.gaps.map((g) => GAP_LABEL[g]).join(' · ')}
                      </div>
                    )}
                    <div style={s.cardActions}>
                      {ACTIVE_STAGES.includes(o.stage) && (
                        <>
                          {stageIdx > 0 && <button style={s.cardBtn} disabled={busy} onClick={() => changeStage(o, OPP_STAGES[stageIdx - 1])}>◀</button>}
                          {o.stage !== 'negotiation'
                            ? <button style={s.cardBtn} disabled={busy} onClick={() => changeStage(o, OPP_STAGES[stageIdx + 1])}>Advance ▶</button>
                            : (
                              <>
                                <button style={{ ...s.cardBtn, color: 'var(--good)' }} disabled={busy} onClick={() => changeStage(o, 'won')}>Won ✓</button>
                                <button style={{ ...s.cardBtn, color: 'var(--bad)' }} disabled={busy} onClick={() => changeStage(o, 'lost')}>Lost ✗</button>
                              </>
                            )}
                        </>
                      )}
                      {o.stage === 'won' && (
                        <button style={{ ...s.cardBtn, color: 'var(--accent)' }} disabled={busy} onClick={() => convertToQuotation(o)}>→ Quotation</button>
                      )}
                    </div>
                  </div>
                );
              })}

              {((col.kind === 'lead' && col.leads!.length === 0) || (col.kind === 'opp' && col.opps!.length === 0)) && (
                <div style={s.colEmpty}>{drag && canDrop(col.key) ? 'Drop here' : '—'}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {view === 'board' && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '-6px 2px 0' }}>
          Drag cards between stages (or use the card buttons) — a lead drops onto Qualified, a qualified lead onto Discovery to become an opportunity.
        </p>
      )}

      {/* ── LIST ── */}
      {view === 'list' && (
        <>
          <div style={s.panel}>
            <div style={s.panelTitle}>Opportunities ({opps.length})</div>
            {opps.length === 0 ? <p style={s.muted}>No opportunities yet — convert a qualified lead, or create one directly.</p> : (
              <table style={s.table}><thead><tr>
                {['Title', 'Account', 'Value', 'Stage', 'Win %', 'Close', 'Path', 'Owner', 'Next action', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}
              </tr></thead><tbody>
                {opps.map((o) => (
                  <tr key={o.id} style={o.stage === 'won' ? { background: 'rgba(40,167,69,0.04)' } : o.stage === 'lost' ? { background: 'rgba(220,53,69,0.04)' } : undefined}>
                    <td style={s.td}><a href={`/crm/opportunities/${o.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}>{o.title}</a></td>
                    <td style={s.tdM}>{o.accountName ?? '—'}</td>
                    <td style={s.td}>{money(o.value)}</td>
                    <td style={s.td}>
                      <select style={{ ...s.select, ...stageColor(o.stage) }} value={o.stage} onChange={(e) => changeStage(o, e.target.value)} disabled={busy}>
                        {OPP_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </td>
                    <td style={s.td}>
                      {o.winProbability}%
                      {forecast?.id === o.id && <div style={s.forecastBubble}><strong>AI: {forecast.prob}%</strong> — {forecast.reason}</div>}
                    </td>
                    <td style={s.tdM}>{o.closeDate ? fmt(o.closeDate) : '—'}</td>
                    <td style={s.td}>
                      <button style={{ ...s.pathTag, color: o.requiresTender === false ? 'var(--accent)' : 'var(--muted)' }} disabled={busy}
                        onClick={() => toggleTenderPath(o)}>
                        {o.requiresTender === false ? 'Direct sale' : 'Tender path'}
                      </button>
                    </td>
                    <td style={s.tdM}>{o.ownerId ?? '—'}</td>
                    <td style={s.tdM}>{o.nextAction ?? '—'}</td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      <button type="button" style={s.btnSec} onClick={() => void runForecast(o.id)} disabled={busy}>🤖 AI</button>
                      {o.stage === 'won' && <button type="button" style={{ ...s.btnSec, marginLeft: 6, color: 'var(--accent)' }} disabled={busy} onClick={() => convertToQuotation(o)}>→ Quote</button>}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div style={s.panel}>
            <div style={s.panelTitle}>Leads ({leads.length})</div>
            {leads.length === 0 ? <p style={s.muted}>No leads yet — capture the first contact with “+ Lead”.</p> : (
              <table style={s.table}><thead><tr>
                {['Name', 'Company', 'Email', 'Source', 'Status', 'Created', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}
              </tr></thead><tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td style={s.td}><strong>{l.name}</strong></td>
                    <td style={s.tdM}>{l.companyName ?? '—'}</td>
                    <td style={s.tdM}>{l.email ?? '—'}</td>
                    <td style={s.td}><span style={s.srcTag}>{l.source ?? '—'}</span></td>
                    <td style={s.td}><span style={statusColor(l.status)}>{l.status}</span></td>
                    <td style={s.tdM}>{fmt(l.createdAt)}</td>
                    <td style={s.td}>
                      {l.status !== 'qualified' && l.status !== 'disqualified' && <button style={s.btnSec} disabled={busy} onClick={() => qualifyLead(l)}>Qualify</button>}
                      {l.status === 'qualified' && <button style={{ ...s.btnSec, color: 'var(--accent)' }} disabled={busy} onClick={() => convertLead(l)}>→ Opportunity</button>}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </>
      )}

      {/* ── FORECAST ── */}
      {/* ── ACTIVITIES ── */}
      {view === 'activities' && (
        <div style={s.panel}>
          <div style={s.panelTitle}>Activities</div>
          {activities === null ? <p style={s.muted}>Loading…</p> : activities.length === 0 ? <p style={s.muted}>No activities logged yet.</p> : (
            <table style={s.table}><thead><tr>
              {['Type', 'Subject', 'Related to', 'Status', 'Due', 'Logged'].map((h) => <th key={h} style={s.th}>{h}</th>)}
            </tr></thead><tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td style={s.td}><span style={s.srcTag}>{a.type}</span></td>
                  <td style={s.td}><strong>{a.subject}</strong></td>
                  <td style={s.tdM}>{a.relatedType ?? '—'}</td>
                  <td style={s.td}><span style={{ ...s.srcTag, textTransform: 'capitalize' }}>{a.status}</span></td>
                  <td style={s.tdM}>{a.dueDate ? fmt(a.dueDate) : '—'}</td>
                  <td style={s.tdM}>{fmt(a.createdAt)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, good }: { label: string; value: string; accent?: boolean; good?: boolean }) {
  return (
    <div style={s.kpiCard}>
      <span style={s.kpiLabel}>{label}</span>
      <span style={{ ...s.kpiVal, ...(accent ? { color: 'var(--accent)' } : {}), ...(good ? { color: 'var(--good)' } : {}) }}>{value}</span>
    </div>
  );
}

function CmdKpi({ label, value, accent, good, bad }: { label: string; value: string; accent?: boolean; good?: boolean; bad?: boolean }) {
  return (
    <div style={s.cmdKpi}>
      <span style={s.cmdKpiLabel}>{label}</span>
      <span style={{ ...s.cmdKpiVal, ...(accent ? { color: 'var(--accent)' } : {}), ...(good ? { color: 'var(--good)' } : {}), ...(bad ? { color: 'var(--bad)' } : {}) }}>{value}</span>
    </div>
  );
}

function statusColor(status: string): CSSProperties {
  const colors: Record<string, string> = { new: '#3b82f6', contacted: '#f59e0b', qualified: '#10b981', nurturing: '#8b5cf6', disqualified: '#ef4444' };
  return { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, background: (colors[status] ?? '#666') + '18', color: colors[status] ?? '#666', border: `1px solid ${(colors[status] ?? '#666')}33` };
}
function stageColor(stage: string): CSSProperties {
  const colors: Record<string, string> = { qualification: '#3b82f6', proposal: '#f59e0b', negotiation: '#8b5cf6', won: '#10b981', lost: '#ef4444' };
  return { color: colors[stage] ?? 'inherit', fontWeight: 600 };
}

const field: CSSProperties = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none' };
const s = {
  kpiStrip: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 } as CSSProperties,
  kpiCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  kpiLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  kpiVal: { fontSize: 18, fontWeight: 700 } as CSSProperties,
  cmdKpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 } as CSSProperties,
  cmdKpi: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  cmdKpiLabel: { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' } as CSSProperties,
  cmdKpiVal: { fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap' } as CSSProperties,
  cmdGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 } as CSSProperties,
  cmdCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' } as CSSProperties,
  cmdTitle: { fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--accent)', marginBottom: 10 } as CSSProperties,
  cmdTh: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
  cmdTd: { padding: '7px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  cmdSub: { fontSize: 11, color: 'var(--muted)', marginTop: 1 } as CSSProperties,
  riskChip: { display: 'inline-block', fontSize: 10.5, background: 'color-mix(in srgb, var(--bad) 10%, transparent)', color: 'var(--bad)', border: '1px solid color-mix(in srgb, var(--bad) 30%, transparent)', borderRadius: 999, padding: '1px 7px', marginRight: 4, marginBottom: 3 } as CSSProperties,
  slipTotal: { fontSize: 12.5, fontWeight: 800, color: 'var(--accent)', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px' } as CSSProperties,
  slipChip: { display: 'inline-block', fontSize: 10.5, background: 'var(--panel-2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px', marginBottom: 3 } as CSSProperties,
  agingRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 } as CSSProperties,
  agingTrack: { height: 8, background: 'var(--panel-2, var(--border))', borderRadius: 999, overflow: 'hidden' } as CSSProperties,
  agingFill: { height: '100%', borderRadius: 999 } as CSSProperties,
  stalledRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  linkBtn: { color: 'var(--accent)', fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' } as CSSProperties,
  tabBar: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  tab: { ...field, cursor: 'pointer', fontWeight: 500 } as CSSProperties,
  tabActive: { ...field, cursor: 'pointer', fontWeight: 700, border: '1px solid var(--accent)', color: 'var(--accent)' } as CSSProperties,
  btnSec: { ...field, cursor: 'pointer', fontWeight: 500, fontSize: 12, padding: '5px 8px' } as CSSProperties,
  select: { ...field, minWidth: 100 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  panelTitle: { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', padding: '10px 12px 4px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdM: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  srcTag: { fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px', textTransform: 'capitalize' } as CSSProperties,
  probBar: { width: '100%', height: 5, background: 'var(--panel-2)', borderRadius: 3, overflow: 'hidden', margin: '6px 0' } as CSSProperties,
  probFill: { height: '100%', borderRadius: 3 } as CSSProperties,
  forecastBubble: { marginTop: 4, fontSize: 11, color: 'var(--accent)', background: 'rgba(255,193,7,0.06)', border: '1px solid rgba(255,193,7,0.15)', borderRadius: 6, padding: '4px 8px' } as CSSProperties,
  errorBar: { background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', color: '#dc3545', padding: '10px 14px', borderRadius: 10, fontSize: 13 } as CSSProperties,
  okBar: { border: '1px solid var(--good)', color: 'var(--good)', padding: '10px 14px', borderRadius: 10, fontSize: 13 } as CSSProperties,
  board: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(190px, 1fr))', gap: 10, overflowX: 'auto' } as CSSProperties,
  col: { background: 'var(--panel)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 12, padding: 8, minWidth: 190, display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'start' } as CSSProperties,
  colHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', padding: '4px 4px 0' } as CSSProperties,
  colCount: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 7px', fontSize: 11 } as CSSProperties,
  colValue: { fontSize: 11, color: 'var(--accent)', fontWeight: 700, padding: '0 4px' } as CSSProperties,
  colEmpty: { color: 'var(--muted)', textAlign: 'center', padding: '14px 0', fontSize: 12 } as CSSProperties,
  card: { background: 'var(--panel-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  cardGrab: { cursor: 'grab' } as CSSProperties,
  cardDragging: { opacity: 0.45, cursor: 'grabbing' } as CSSProperties,
  colDroppable: { borderStyle: 'dashed', borderColor: 'var(--accent)' } as CSSProperties,
  colHover: { background: 'rgba(255,193,7,0.06)', borderColor: 'var(--accent)' } as CSSProperties,
  cardWon: { borderColor: 'var(--good)' } as CSSProperties,
  cardLost: { opacity: 0.65 } as CSSProperties,
  cardTitle: { fontWeight: 700, fontSize: 12.5, lineHeight: 1.3 } as CSSProperties,
  cardSub: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  cardMetaRow: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' } as CSSProperties,
  cardActions: { display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' } as CSSProperties,
  cardBtn: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontSize: 11.5, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  pathTag: { background: 'transparent', border: '1px dashed var(--border)', borderRadius: 999, fontSize: 10.5, padding: '2px 8px', cursor: 'pointer', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  nextAction: { fontSize: 11.5, color: 'var(--accent)', background: 'rgba(255,193,7,0.05)', border: '1px dashed rgba(255,193,7,0.25)', borderRadius: 6, padding: '3px 7px' } as CSSProperties,
  attnBadge: { fontSize: 11, fontWeight: 600, color: 'var(--bad)', background: 'rgba(220,53,69,0.08)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: 6, padding: '3px 7px', marginTop: 4 } as CSSProperties,
};
