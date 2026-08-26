'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { STAKEHOLDER_ROLE_LABEL, STRENGTH_LABEL, STRENGTH_COLOR } from './stakeholder-meta';
import Timeline from './timeline';
import CommercialPanel from './commercial-panel';
import BuyingJourneyPanel from './buying-journey-panel';
import WinPlanPanel from './win-plan-panel';
import DealDepthPanel from './deal-depth-panel';
import {
  RecordShell, RecordHeader, RecordCard, CardGrid, InsightsPanel, useTab,
  RecordBand, RecordSituation, RecordNextAction, RecordHealth, RecordMissing, RecordWorkflowGate, RecordOutcome,
  type Tone, type KpiItem, type MetaItem, type TabDef, type Insight,
  type HealthState, type NextBestAction, type WorkflowGateView,
} from './crm/record-shell';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import { buildDealOutreach, requestDealOutreachDraft, personalise, toE164Digits, mailtoHref, whatsappHref } from '@/lib/lead-outreach';
import { shouldPromptQuoteOnWon } from './opportunity-360-insights';

// Opportunity 360 — the deal command center. Header (value/close/owner/route) →
// qualification (BANT, editable) → progression (opportunity → tender? → quotation
// → contract → project) → stakeholders + competitors → activity → win/loss.

interface Opportunity {
  id: string; title: string; value: number; stage: string; winProbability: number;
  closeDate: string | null; requiresTender: boolean; executionType?: string; ownerId: string | null; nextAction: string | null;
  accountId: string | null; accountName: string | null;
  budgetConfirmed: boolean; authorityConfirmed: boolean; needConfirmed: boolean; timelineConfirmed: boolean;
  competitors: string | null; source: string | null; lossReason: string | null; createdAt: string;
}
interface Stakeholder { id: string; name: string; jobTitle: string | null; stakeholderRole: string | null; relationshipStrength: string | null; isPrimary: boolean; email: string | null; phone: string | null }
interface Step { key: string; label: string; reached: boolean; count: number; value: number | null; href: string | null }
interface ActivityRec { id: string; type: string; subject: string; status: string; dueDate: string | null; createdAt: string }

interface QuotationLite { id: string; quoteNumber: string; status: string; total: number }
interface TenderLite { id: string; reference: string | null; title: string; status: string; value: number }
// Context-only view of DMS documents linked to this deal (aggregateType 'crm.opportunity').
interface DocRow { id: string; title: string; kind: string; currentVersion?: number; updatedAt?: string }

interface Payload {
  opportunity: Opportunity;
  account: { id: string; name: string; status: string } | null;
  stakeholders: Stakeholder[];
  tenders: TenderLite[];
  quotations: QuotationLite[];
  activities: ActivityRec[];
  qualification: { budget: boolean; authority: boolean; need: boolean; timeline: boolean; score: number };
  route: 'tender' | 'direct';
  progression: Step[];
  outcome: { status: 'open' | 'won' | 'lost'; lossReason: string | null; contractedValue: number | null; awardSource: string | null };
  /** G2 — resolved server-side from the activity stream; render this, never re-derive the rule. */
  nextAction: { subject: string | null; dueDate: string | null; ownerId: string | null; fromActivity: boolean };
  attention: { active: boolean; gaps: string[]; needsAttention: boolean };
  /** Phase 0 — lifecycle/outcome. `stage = 'won'` alone does not say whether an award evidences it. */
  lifecycle: { state: 'OPEN' | 'GOVERNED_WON' | 'LEGACY_WON' | 'LOST'; terminal: boolean; won: boolean; awardDocumented: boolean; awardValue: number | null; awardSource: string | null; awardedQuotationId: string | null };
  /** G5 — the next-stage gate, resolved server-side. Rendered as-is; the client never re-derives it. */
  stageGate: WorkflowGateView | null;
}

const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
// The contracted value is a PRECISE commercial figure (the accepted Commercial Baseline subtotal),
// so it is shown to the fils — unlike rounded pipeline/headline amounts.
const aed2 = (n: number): string => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const d = (iso: string): string => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });

const STAGE_OPTIONS = ['qualification', 'proposal', 'negotiation', 'won', 'lost'];
// The execution fork — how this opportunity is delivered once discovery is done.
const EXECUTION_OPTIONS = [
  { value: 'direct_sale', label: 'Direct sale' },
  { value: 'tender', label: 'Tender' },
  { value: 'framework_agreement', label: 'Framework agreement' },
  { value: 'amc_renewal', label: 'AMC renewal' },
  { value: 'variation_order', label: 'Variation order' },
];
const BANT: Array<{ key: 'budget' | 'authority' | 'need' | 'timeline'; field: string; label: string }> = [
  { key: 'budget', field: 'budgetConfirmed', label: 'Budget' },
  { key: 'authority', field: 'authorityConfirmed', label: 'Authority' },
  { key: 'need', field: 'needConfirmed', label: 'Need' },
  { key: 'timeline', field: 'timelineConfirmed', label: 'Timeline' },
];

export default function Opportunity360Client({ opportunityId }: { opportunityId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useTab('overview');
  // Closing a deal needs its reason in the SAME patch (§40.3/40.4 stage gate) — capture it inline.
  const [closing, setClosing] = useState<{ stage: 'won' | 'lost'; reason: string } | null>(null);
  // Outcome Loop — after acting on the Next Best Action, capture what happened so no deal goes dead.
  const [outcomeNote, setOutcomeNote] = useState<string | null>(null);
  // Documents are read from the DMS on demand (context-only — Sales keeps no file store).
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  // Communication — a shared, editable deal-grounded outreach draft (greeting added per stakeholder).
  const [dealSubject, setDealSubject] = useState('');
  const [dealBody, setDealBody] = useState('');
  const [dealDrafted, setDealDrafted] = useState(false);
  const [suggBusy, setSuggBusy] = useState(false);
  // setBusy is async; a fast double-click can land before the re-render. The ref rejects it.
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/summary`, { cache: 'no-store' });
    if (!res.ok) { setErr('Failed to load the opportunity'); return; }
    setData(await res.json());
  }, [opportunityId]);

  useEffect(() => { void load(); }, [load]);

  // Seed the outreach draft once from the loaded deal (edits are preserved thereafter).
  useEffect(() => {
    if (!data || dealDrafted) return;
    const dr = buildDealOutreach({
      title: data.opportunity.title,
      accountName: data.account?.name ?? data.opportunity.accountName ?? null,
      value: data.opportunity.value,
      stage: data.opportunity.stage,
    });
    setDealSubject(dr.subject); setDealBody(dr.body); setDealDrafted(true);
  }, [data, dealDrafted]);

  // Documents tab: read this deal's linked documents straight from the DMS. Read-only — creating
  // and revising documents stays in Document Control.
  useEffect(() => {
    if (tab !== 'documents' || docs !== null) return;
    void fetch(`/api/documents?aggregateType=crm.opportunity&aggregateId=${opportunityId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('dms'))))
      .then((d: unknown) => setDocs(Array.isArray(d) ? (d as DocRow[]) : []))
      .catch(() => setDocs([]));
  }, [tab, docs, opportunityId]);

  // Generating a quotation was written inline in three places, none of which set `busy` —
  // so even the button that reads `disabled={busy}` never actually disabled for this action.
  // The call takes seconds (POST, then a full summary reload), and a second click during that
  // window POSTs again and drafts a SECOND quotation off the same deal.
  const generateQuotation = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/convert-to-quotation`, { method: 'POST' });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setErr(d.message ?? d.error ?? 'Could not generate a quotation from this deal.');
        return;
      }
      await load();
    } catch {
      setErr('Could not reach the server — no quotation was generated.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [opportunityId, load]);

  // The tender path (mirror of generateQuotation). One click starts the competitive bid and takes
  // the seller into the tender workspace. Ref-guarded against the double-click that would otherwise
  // race a second POST before `busy` re-renders (the endpoint is idempotent, but the jump is not).
  const startTender = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/start-tender`, { method: 'POST' });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setErr(d.message ?? d.error ?? 'Could not start a tender from this deal.');
        return;
      }
      const tender = (await res.json().catch(() => null)) as { id?: string } | null;
      if (tender?.id) { window.location.href = `/tendering/tenders/${tender.id}`; return; }
      await load();
    } catch {
      setErr('Could not reach the server — no tender was started.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [opportunityId, load]);

  const patch = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message || d.error || 'Update refused');
        return false;
      }
      await load();
      return true;
    } finally { setBusy(false); }
  }, [opportunityId, load]);

  if (!data) return <p style={{ color: 'var(--muted)' }}>{err ?? 'Loading opportunity…'}</p>;

  const { opportunity: o, account, stakeholders, tenders, quotations, activities, qualification, route, progression, outcome, nextAction, attention, stageGate, lifecycle } = data;
  const OUTCOME = {
    open: { label: 'Open', color: 'var(--accent)', tone: 'accent' as Tone },
    won: { label: 'Won', color: 'var(--good)', tone: 'good' as Tone },
    lost: { label: 'Lost', color: 'var(--bad)', tone: 'bad' as Tone },
  }[outcome.status];
  const competitors = (o.competitors ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  // ── Universal Object Shell — Situation / Business Health / Missing Info / Next Best Action ──
  // Composed from facts the server already resolved (attention, qualification, nextAction) — the
  // band never re-derives a rule, it only renders what the domain owns.
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  const winPct = outcome.status === 'won' ? 100 : outcome.status === 'lost' ? 0 : o.winProbability;
  const situationText = `${cap(o.stage)} · ${winPct}% win · AED ${aed(o.value)}${o.closeDate ? ` · close ${d(o.closeDate)}` : ''}`;

  const gapLabel = (g: string): string => (({
    'no-next-action': 'no next action', 'no-owner': 'no owner', 'no-due-date': 'no due date',
    stale: 'gone quiet', STALE: 'gone quiet', QUALIFICATION_STALLED: 'qualification stalled',
    NO_NEXT_ACTIVITY: 'nothing scheduled',
  } as Record<string, string>)[g] ?? g.replace(/[-_]/g, ' ').toLowerCase());

  let health: HealthState;
  if (outcome.status === 'won') health = { label: 'Won', tone: 'good' };
  else if (outcome.status === 'lost') health = { label: 'Lost', tone: 'neutral' };
  else if (attention?.needsAttention) health = { label: 'At risk', tone: 'bad', reasons: (attention.gaps ?? []).map(gapLabel) };
  else if (qualification.score < 2) health = { label: 'Early', tone: 'warn', reasons: ['weak qualification'] };
  else health = { label: 'On track', tone: 'good' };

  // Missing Information — the specific facts blocking progress (the ERP differentiator).
  const missing: string[] = [];
  if (outcome.status === 'open') {
    if (!o.budgetConfirmed) missing.push('Budget');
    if (!o.authorityConfirmed) missing.push('Decision maker');
    if (!o.needConfirmed) missing.push('Need');
    if (!o.timelineConfirmed) missing.push('Timeline');
    if (stakeholders.length === 0) missing.push('Stakeholders mapped');
    if (!nextAction.subject) missing.push('Next action');
    if (!o.closeDate) missing.push('Close date');
  }

  // The ONE next best action — pick the single most valuable move given the current state.
  let nba: NextBestAction | undefined;
  if (outcome.status === 'open') {
    if (nextAction.subject) nba = { label: 'Work the next step', hint: `${nextAction.subject}${nextAction.dueDate ? ` · due ${d(nextAction.dueDate)}` : ''}`, onClick: () => setTab('activity') };
    else if (qualification.score < 2) nba = { label: 'Qualify (BANT)', hint: `Only ${qualification.score}/4 confirmed`, onClick: () => setTab('qualification') };
    else if (stakeholders.length === 0) nba = { label: 'Map the decision maker', hint: 'No stakeholders mapped yet', onClick: () => setTab('stakeholders') };
    else nba = { label: 'Log the next step', hint: 'Keep the deal moving', onClick: () => setTab('activity') };
  } else if (outcome.status === 'won' && !o.requiresTender) {
    nba = { label: '→ Generate quotation', hint: 'Won — turn it into a quote', onClick: () => { void generateQuotation(); } };
  }

  // Outcome Loop — writes a real activity linked to this opportunity (reuses the §17 activity stream).
  const logOutcome = async (choiceId: string): Promise<void> => {
    const step = nextAction.subject ?? 'next step';
    const plan: Record<string, { type: string; subject: string; status?: string }> = {
      completed: { type: 'note', subject: `Outcome — ${step}: completed`, status: 'completed' },
      failed: { type: 'note', subject: `Outcome — ${step}: did not land`, status: 'completed' },
      follow_up: { type: 'follow_up', subject: `Follow up: ${o.title}` },
      reschedule: { type: 'task', subject: `Reschedule: ${step}` },
    };
    const a = plan[choiceId];
    if (!a) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/crm/activities', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: a.type, subject: a.subject, relatedType: 'opportunity', relatedId: o.id, relatedName: o.title, status: a.status }),
      });
      if (!res.ok) { setErr('Could not log the outcome'); return; }
      setOutcomeNote(`Logged: ${a.subject}`);
      await load();
    } finally { setBusy(false); }
  };

  // Regenerate the outreach body with AURA (real /api/ai only). Failure keeps the current draft.
  const suggestDealMessage = async (): Promise<void> => {
    setSuggBusy(true);
    try {
      const text = await requestDealOutreachDraft({ title: o.title, accountName: account?.name ?? o.accountName ?? null, value: o.value, stage: o.stage });
      if (text) setDealBody(text);
    } catch { /* keep the existing draft */ } finally { setSuggBusy(false); }
  };

  const meta: MetaItem[] = [
    ...(account ? [{ label: 'for', value: <a href={`/crm/accounts/${account.id}`} style={st.link}>{account.name}</a> }] as MetaItem[]
      : o.accountName ? [{ label: 'for', value: o.accountName }] as MetaItem[] : []),
    { value: <span style={st.routePill}>{route === 'tender' ? 'Tender route' : 'Direct route'}</span> },
    ...(o.source ? [{ label: 'Source', value: o.source }] as MetaItem[] : []),
  ];

  const actions = (
    <>
      <span style={st.metaLabel}>Stage</span>
      <select disabled={busy} value={closing?.stage ?? o.stage}
        onChange={(e) => {
          const next = e.target.value;
          if (next === 'won' || next === 'lost') setClosing({ stage: next, reason: '' });
          else { setClosing(null); void patch({ stage: next }); }
        }} style={st.select}>
        {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <span style={st.metaLabel}>Execution</span>
      <select disabled={busy} value={o.executionType ?? (o.requiresTender ? 'tender' : 'direct_sale')}
        onChange={(e) => void patch({ executionType: e.target.value })} style={st.select}
        title="How this opportunity is executed — the fork between the sales and tender lifecycles">
        {EXECUTION_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
      </select>
      {closing && (
        <>
          <input autoFocus value={closing.reason} placeholder={closing.stage === 'won' ? 'Why did we win?' : 'Why did we lose?'}
            onChange={(e) => setClosing({ ...closing, reason: e.target.value })} style={{ ...st.input, width: 220, marginBottom: 0 }} />
          <button disabled={busy || !closing.reason.trim()} aria-busy={busy} style={st.actionBtn}
            onClick={() => {
              void patch({ stage: closing.stage, [closing.stage === 'won' ? 'winReason' : 'lossReason']: closing.reason.trim() })
                .then((ok) => { if (ok) setClosing(null); });
            }}>
            {busy ? 'Saving…' : `Confirm ${closing.stage} ✓`}
          </button>
          <button disabled={busy} style={st.ghostBtn} onClick={() => setClosing(null)}>Cancel</button>
        </>
      )}
      {o.stage === 'won' && !o.requiresTender && (
        <button disabled={busy} onClick={() => { void generateQuotation(); }} style={st.actionBtn}>{busy ? 'Generating…' : '→ Quotation'}</button>
      )}
      {/* The tender path: start the bid while the deal is still open (bidding precedes winning).
          Once a tender exists, the button becomes a link into its workspace. */}
      {route === 'tender' && (
        tenders.length > 0
          ? <a href={`/tendering/tenders/${tenders[0].id}`} style={st.actionBtn}>→ Tender{tenders[0].reference ? ` ${tenders[0].reference}` : ''}</a>
          : outcome.status !== 'lost'
            ? <button disabled={busy} onClick={() => { void startTender(); }} style={st.actionBtn}>{busy ? 'Starting…' : '▶ Start Tender'}</button>
            : null
      )}
      {err && <span style={{ color: 'var(--bad)', fontSize: 12.5, fontWeight: 600 }}>{err}</span>}
    </>
  );

  const kpis: KpiItem[] = [
    { label: 'Value', value: `AED ${aed(o.value)}`, tone: 'accent' },
    { label: 'Win probability', value: outcome.status === 'won' ? '100%' : outcome.status === 'lost' ? '0%' : `${o.winProbability}%`, tone: outcome.status === 'won' ? 'good' : 'neutral' },
    { label: 'Qualification', value: `${qualification.score}/4`, tone: outcome.status === 'open' && qualification.score < 2 ? 'warn' : 'neutral' },
    { label: 'Expected close', value: o.closeDate ? d(o.closeDate) : '—' },
    { label: 'Owner', value: o.ownerId ?? 'Unassigned' },
    // null = award provenance without a resolved contracted value (a real inconsistency) — show it
    // as such, never as "AED 0". 0 with no award is a legitimate legacy/uncontracted zero.
    { label: 'Contracted', value: outcome.contractedValue == null ? 'AED — (award value missing)' : `AED ${aed2(outcome.contractedValue)}`, tone: outcome.contractedValue == null ? 'warn' : outcome.contractedValue > 0 ? 'good' : 'neutral' },
  ];

  const pendingApprovals = quotations.filter((q) => q.status === 'internal_review');
  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'qualification', label: 'Qualification' },
    { id: 'commercial', label: 'Commercial' },
    { id: 'stakeholders', label: 'Contacts', count: stakeholders.length },
    { id: 'quotation', label: 'Quotation', count: quotations.length },
    { id: 'journey', label: 'Journey' },
    { id: 'winplan', label: 'Win Plan' },
    { id: 'depth', label: 'Deal Depth' },
    { id: 'activity', label: 'Activities', count: activities.length },
    { id: 'communication', label: 'Communication' },
    { id: 'documents', label: 'Documents' },
    { id: 'approvals', label: 'Approvals', count: pendingApprovals.length || undefined },
    { id: 'history', label: 'History' },
  ];

  const insights: Insight[] = [];
  if (attention?.gaps?.length) insights.push({ tone: 'warn', title: 'Needs attention', detail: attention.gaps.join(', ') });
  if (nextAction.subject) insights.push({ tone: 'accent', title: 'Next action', detail: `${nextAction.subject}${nextAction.dueDate ? ` · due ${d(nextAction.dueDate)}` : ''}` });
  if (outcome.status === 'open' && qualification.score < 2) insights.push({ tone: 'warn', title: 'Weakly qualified', detail: `BANT ${qualification.score}/4 — confirm budget, authority, need, timing.`, action: { label: 'Qualify', onClick: () => setTab('qualification') } });
  if (shouldPromptQuoteOnWon(outcome)) insights.push({ tone: 'accent', title: 'Won — convert to a quote', detail: 'This deal is won but not yet quoted/contracted.', action: { label: 'Generate quotation', onClick: () => setTab('quotation') } });
  if (outcome.status === 'open') insights.push({ tone: 'neutral', title: 'Outcome open', detail: 'Move the stage to Won or Lost to capture the result.' });
  if (competitors.length) insights.push({ tone: 'neutral', title: 'Competitive deal', detail: `Against: ${competitors.join(', ')}` });
  if (lifecycle.state === 'LEGACY_WON') insights.push({ tone: 'warn', title: 'Won — award not evidenced', detail: 'No accepted quotation or tender award backs this win, so the contracted value has no provenance.' });

  // What this rail is actually able to judge. An open deal is covered by the pursuit rules; a CLOSED
  // deal is not — the post-award questions (customer PO/LOA, contract, handover) have no rules yet,
  // so the rail must say "not assessed" rather than congratulate the user. Silence is not health.
  const openDeal = outcome.status === 'open';
  const insightsAssessment = {
    attentionCount: insights.filter((i) => i.tone === 'warn' || i.tone === 'bad').length,
    required: openDeal
      ? ['qualification', 'the next action', 'deal attention']
      : ['customer award evidence (PO/LOA)', 'contract handover'],
    assessed: openDeal
      ? ['qualification', 'the next action', ...(attention?.active ? ['deal attention'] : [])]
      : [],
  };

  return (
    <RecordShell
      header={<RecordHeader title={o.title} status={OUTCOME.label} statusTone={OUTCOME.tone} meta={meta} score={{ value: outcome.status === 'won' ? '100%' : outcome.status === 'lost' ? '0%' : `${o.winProbability}%`, label: 'Win prob', badge: `${qualification.score}/4 BANT`, badgeTone: outcome.status === 'open' && qualification.score < 2 ? 'warn' : 'good' }} actions={actions} />}
      kpis={kpis}
      situation={
        <RecordBand tone={health.tone}>
          <RecordSituation situation={situationText} />
          {nba && <RecordNextAction action={nba} />}
          <RecordHealth health={health} />
          <RecordMissing items={missing} />
          {stageGate && <RecordWorkflowGate gate={stageGate} />}
          {outcome.status === 'open' && <RecordOutcome outcome={{ onSelect: logOutcome, busy, note: outcomeNote }} />}
        </RecordBand>
      }
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      aside={<InsightsPanel insights={insights} assessment={insightsAssessment} context="this deal" />}
      footer={
        <RecordCard title={`Deal progression — ${route === 'tender' ? 'via Tender' : 'Direct'}`} span={2}>
          <div style={st.chainRow}>
            {progression.map((s, i) => (
              <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: 'var(--muted)' }}>→</span>}
                <span style={{ ...st.chainNode, ...(s.reached ? st.chainNodeOn : {}) }}>
                  {s.href && s.reached ? <a href={s.href} style={{ color: 'inherit', textDecoration: 'none' }}>{node(s)}</a> : node(s)}
                </span>
              </span>
            ))}
          </div>
        </RecordCard>
      }
    >
      {tab === 'overview' && (
        <CardGrid>
          <RecordCard title="Competitors">
            {competitors.length === 0 ? <p style={st.muted}>No competitors recorded.</p> : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {competitors.map((c) => <span key={c} style={st.competitorChip}>{c}</span>)}
              </div>
            )}
            <input key={o.competitors ?? 'none'} defaultValue={o.competitors ?? ''} placeholder="e.g. Rival ELV LLC, Acme Systems"
              onBlur={(e) => { if (e.target.value !== (o.competitors ?? '')) void patch({ competitors: e.target.value }); }} style={st.input} />
            <p style={st.muted}>Comma-separated — who else is bidding.</p>
          </RecordCard>

          <RecordCard title="Win / Loss intelligence">
            <div style={{ fontSize: 14, fontWeight: 700, color: OUTCOME.color, marginBottom: 6 }}>● {OUTCOME.label}</div>
            {outcome.status === 'won' && <p style={st.muted}>Contracted value {outcome.contractedValue == null ? '— (award value missing)' : `AED ${aed2(outcome.contractedValue)}`}{o.competitors ? ` · beat: ${o.competitors}` : ''}.</p>}
            {outcome.status === 'lost' && (
              <>
                <p style={{ ...st.muted, marginTop: 0 }}>Reason we lost:</p>
                <input key={o.lossReason ?? 'none'} defaultValue={o.lossReason ?? ''} placeholder="e.g. price, incumbent, timing"
                  onBlur={(e) => { if (e.target.value !== (o.lossReason ?? '')) void patch({ lossReason: e.target.value }); }} style={st.input} />
              </>
            )}
            {outcome.status === 'open' && <p style={st.muted}>Move the stage to Won or Lost to capture the outcome.</p>}
            {nextAction.subject && (
              <p style={{ ...st.muted, marginTop: 8 }}>
                Next action: <b style={{ color: 'var(--text)' }}>{nextAction.subject}</b>
                {nextAction.dueDate && <> · due {d(nextAction.dueDate)}</>}
                {nextAction.fromActivity && <span style={st.fromActivity} title="Derived from the next open activity — complete it and this moves automatically">from activity</span>}
              </p>
            )}
          </RecordCard>
        </CardGrid>
      )}

      {tab === 'qualification' && (
        <RecordCard title="Qualification (BANT)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {BANT.map((b) => (
              <label key={b.key} style={st.checkRow}>
                <input type="checkbox" disabled={busy} checked={qualification[b.key]} onChange={(e) => void patch({ [b.field]: e.target.checked })} />
                <span>{b.label} confirmed</span>
              </label>
            ))}
          </div>
          <p style={{ ...st.muted, marginTop: 8 }}>Score {qualification.score}/4 — {qualification.score >= 3 ? 'well qualified' : qualification.score === 2 ? 'partially qualified' : 'early / unqualified'}.</p>
        </RecordCard>
      )}

      {tab === 'commercial' && <CommercialPanel opportunityId={o.id} />}
      {tab === 'journey' && <BuyingJourneyPanel opportunityId={o.id} />}
      {tab === 'winplan' && <WinPlanPanel opportunityId={o.id} />}
      {tab === 'depth' && <DealDepthPanel opportunityId={o.id} />}

      {tab === 'stakeholders' && (
        <RecordCard title={`Stakeholders ${account ? `at ${account.name}` : ''}`}>
          {stakeholders.length === 0 ? (
            <p style={st.muted}>No stakeholders mapped — <a href="/crm/contacts" style={st.link}>add the people behind this deal →</a></p>
          ) : (
            [...stakeholders].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((s) => (
              <div key={s.id} style={st.stkRow}>
                {s.isPrimary && <span style={{ color: 'var(--accent)' }}>★</span>}
                <a href={`/crm/contacts/${s.id}`} style={st.link}>{s.name}</a>
                {s.stakeholderRole && <span style={st.rolePill}>{STAKEHOLDER_ROLE_LABEL[s.stakeholderRole] ?? s.stakeholderRole}</span>}
                {s.relationshipStrength && <span style={{ fontSize: 11, fontWeight: 700, color: STRENGTH_COLOR[s.relationshipStrength] ?? 'var(--muted)' }}>{STRENGTH_LABEL[s.relationshipStrength] ?? s.relationshipStrength}</span>}
              </div>
            ))
          )}
        </RecordCard>
      )}

      {tab === 'quotation' && (
        <RecordCard title="Quotations for this deal">
          {quotations.length === 0 ? (
            <p style={st.muted}>
              No quotation yet — {outcome.status === 'won' && !o.requiresTender
                ? <button style={st.linkBtn} disabled={busy} onClick={() => { void generateQuotation(); }}>{busy ? 'Generating…' : 'generate one from this deal →'}</button>
                : <a href="/crm/quotations" style={st.link}>create a quotation →</a>}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={st.qTable}>
                <thead><tr>{['Number', 'Status', 'Total', ''].map((h, i) => <th key={h} style={{ ...st.qTh, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {quotations.map((q) => (
                    <tr key={q.id}>
                      <td style={st.qTd}>{q.quoteNumber}</td>
                      <td style={st.qTd}><span style={st.statusPill}>{q.status.replace(/_/g, ' ')}</span></td>
                      <td style={{ ...st.qTd, textAlign: 'right' }}>AED {aed(q.total)}</td>
                      <td style={{ ...st.qTd, textAlign: 'right' }}><a href={`/crm/quotations/${q.id}`} style={st.link}>Open →</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </RecordCard>
      )}

      {tab === 'activity' && (
        <RecordCard title="Activities">
          {activities.length === 0 ? (
            <p style={st.muted}>No activities logged yet — <a href="/crm/activities" style={st.link}>log the next step →</a></p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={st.qTable}>
                <thead><tr>{['Type', 'Subject', 'Status', 'Due'].map((h) => <th key={h} style={{ ...st.qTh, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {activities.map((x) => (
                    <tr key={x.id}>
                      <td style={{ ...st.qTd, textTransform: 'capitalize' }}>{x.type}</td>
                      <td style={st.qTd}>{x.subject}</td>
                      <td style={st.qTd}><span style={st.statusPill}>{x.status.replace(/_/g, ' ')}</span></td>
                      <td style={st.qTd}>{x.dueDate ? d(x.dueDate) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </RecordCard>
      )}

      {tab === 'communication' && (
        <RecordCard title="Communication">
          <p style={{ ...st.muted, marginTop: 0 }}>
            Reach a stakeholder on their own channel with a ready draft, or open the internal <b>Communication Center</b> for team chat and mail. AURA prepares the message; it does not send it.
          </p>

          <div style={st.commBox}>
            <div style={st.commRow}>
              <span style={st.commLabel}>Suggested message</span>
              <button type="button" disabled={suggBusy} onClick={() => void suggestDealMessage()} style={st.actionBtn}>
                {suggBusy ? 'Drafting…' : '✨ Suggest with AURA'}
              </button>
            </div>
            <input value={dealSubject} onChange={(e) => setDealSubject(e.target.value)} placeholder="Subject (email)" style={st.commInput} />
            <textarea value={dealBody} onChange={(e) => setDealBody(e.target.value)} rows={5} style={st.commTextarea} />
            <p style={st.muted}>A greeting (“Hi &lt;name&gt;,”) is added automatically for each stakeholder.</p>
          </div>

          {stakeholders.length === 0 ? (
            <p style={st.muted}>No stakeholders mapped — <a href="/crm/contacts" style={st.link}>add the people behind this deal →</a></p>
          ) : (
            stakeholders.map((s) => {
              const wa = toE164Digits(s.phone);
              const msg = personalise(dealBody, s.name);
              return (
                <div key={s.id} style={st.stkRow}>
                  {s.isPrimary && <span style={{ color: 'var(--accent)' }}>★</span>}
                  <a href={`/crm/contacts/${s.id}`} style={st.link}>{s.name}</a>
                  {s.jobTitle && <span style={st.muted}>· {s.jobTitle}</span>}
                  <span style={{ flex: 1 }} />
                  {s.email && <a href={mailtoHref(s.email, dealSubject, msg)} style={st.chBtn}>✉ Email</a>}
                  {wa && <a href={whatsappHref(wa, msg)} target="_blank" rel="noreferrer" style={st.chBtn}>WhatsApp</a>}
                  {!s.email && !wa && <span style={{ ...st.muted, fontSize: 11.5 }}>{s.phone ? 'phone needs +country code' : 'no email/phone'}</span>}
                </div>
              );
            })
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0 0' }}>
            <a href="/my-work/communication" style={st.actionBtn}>Open Communication Center →</a>
            {account && <a href={`/crm/accounts/${account.id}`} style={st.actionBtn}>Customer 360 →</a>}
          </div>
        </RecordCard>
      )}

      {tab === 'documents' && (
        <RecordCard title="Documents">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
            <p style={{ ...st.muted, marginTop: 0, maxWidth: 560 }}>
              Documents linked to this deal in <b>Document Control</b> (the DMS). Read-only here — upload, versions and access stay there.
            </p>
            <a href="/documents/control" style={{ ...st.actionBtn, flexShrink: 0 }}>Open Document Control →</a>
          </div>
          {docs === null ? (
            <p style={st.muted}>Loading documents…</p>
          ) : docs.length === 0 ? (
            <p style={st.muted}>No documents linked to this deal yet — attach them from Document Control.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={st.qTable}>
                <thead><tr>{['Title', 'Kind', 'Version', 'Updated'].map((h) => <th key={h} style={{ ...st.qTh, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {docs.map((dc) => (
                    <tr key={dc.id}>
                      <td style={st.qTd}>{dc.title}</td>
                      <td style={{ ...st.qTd, textTransform: 'capitalize', color: 'var(--muted)' }}>{dc.kind?.replace(/[._]/g, ' ')}</td>
                      <td style={st.qTd}>{dc.currentVersion != null ? `v${dc.currentVersion}` : '—'}</td>
                      <td style={st.qTd}>{dc.updatedAt ? d(dc.updatedAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </RecordCard>
      )}

      {tab === 'approvals' && (
        <RecordCard title="Approvals">
          <p style={{ ...st.muted, marginTop: 0 }}>
            Approvals are actioned in <b>My Work → Approvals</b>; Sales shows only the status here. Nothing is approved inside the deal.
          </p>
          <div style={{ margin: '10px 0 14px' }}>
            <a href="/my-work/approvals" style={st.actionBtn}>Open My Work → Approvals →</a>
          </div>
          {pendingApprovals.length === 0 ? (
            <p style={st.muted}>No approvals pending for this deal.</p>
          ) : (
            pendingApprovals.map((q) => (
              <div key={q.id} style={st.stkRow}>
                <span style={st.statusPill}>Awaiting approval</span>
                <a href={`/crm/quotations/${q.id}`} style={st.link}>{q.quoteNumber}</a>
                <span style={st.muted}>· AED {aed(q.total)}</span>
              </div>
            ))
          )}
        </RecordCard>
      )}

      {tab === 'history' && (
        <RecordCard title="Deal history">
          <Timeline recordId={o.id} />
        </RecordCard>
      )}
    </RecordShell>
  );
}

function node(s: Step) {
  return (
    <>
      {s.label} {s.reached ? <b>{s.count}</b> : <span style={{ opacity: 0.6 }}>—</span>}
      {s.value !== null && s.value > 0 && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {aed(s.value)}</span>}
    </>
  );
}

const st = {
  /** Marks a next action that is projected from the activity stream rather than a typed column. */
  fromActivity: { marginLeft: 8, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 7px' } as CSSProperties,
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 } as CSSProperties,
  h1: { fontSize: 25, margin: '0 0 6px', color: 'var(--accent)', letterSpacing: -0.4 } as CSSProperties,
  subline: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  outcomePill: { fontSize: 11.5, borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '2px 10px', fontWeight: 700 } as CSSProperties,
  routePill: { fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px', color: 'var(--text)' } as CSSProperties,
  metaLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' } as CSSProperties,
  select: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '5px 9px', fontSize: 12.5, textTransform: 'capitalize' } as CSSProperties,
  actionBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', background: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
  ghostBtn: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', padding: '7px 6px' } as CSSProperties,
  stats: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginBottom: 12 } as CSSProperties,
  section: { padding: '12px 16px', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 14 } as CSSProperties,
  sectionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--accent)', fontWeight: 800, marginBottom: 8 } as CSSProperties,
  chainRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 } as CSSProperties,
  chainNode: { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', color: 'var(--muted)' } as CSSProperties,
  chainNodeOn: { color: 'var(--text)', borderColor: 'var(--accent)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 } as CSSProperties,
  block: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--panel)' } as CSSProperties,
  blockTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 800, marginBottom: 8 } as CSSProperties,
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  competitorChip: { fontSize: 12, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px', background: 'var(--panel-2, var(--panel))' } as CSSProperties,
  commBox: { display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0 14px', border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--panel-2, var(--panel))' } as CSSProperties,
  commRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as CSSProperties,
  commLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 800 } as CSSProperties,
  commInput: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, outline: 'none' } as CSSProperties,
  commTextarea: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'vertical' } as CSSProperties,
  chBtn: { border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', borderRadius: 7, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, textDecoration: 'none' } as CSSProperties,
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '6px 10px', fontSize: 12.5 } as CSSProperties,
  stkRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 } as CSSProperties,
  rolePill: { fontSize: 10.5, border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px', color: 'var(--text)' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: '4px 0' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 } as CSSProperties,
  qTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  qTh: { padding: '7px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' } as CSSProperties,
  qTd: { padding: '8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } as CSSProperties,
  statusPill: { fontSize: 11, textTransform: 'capitalize', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px', color: 'var(--muted)' } as CSSProperties,
  tlRow: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 2px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  tlDate: { color: 'var(--muted)', fontSize: 12, width: 86, flexShrink: 0 } as CSSProperties,
};
