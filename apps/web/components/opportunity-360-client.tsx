'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { STAKEHOLDER_ROLE_LABEL, STRENGTH_LABEL, STRENGTH_COLOR } from './stakeholder-meta';
import Timeline from './timeline';
import PreAwardPanel from './pre-award-panel';
import BuyingJourneyPanel from './buying-journey-panel';
import WinPlanPanel from './win-plan-panel';
import DealDepthPanel from './deal-depth-panel';
import {
  RecordShell, RecordHeader, RecordCard, CardGrid, InsightsPanel, SituationBand, useTab,
  type Tone, type KpiItem, type MetaItem, type TabDef, type Insight,
  type HealthState, type NextBestAction, type StageGateView,
} from './crm/record-shell';

// Opportunity 360 — the deal command center. Header (value/close/owner/route) →
// qualification (BANT, editable) → progression (opportunity → tender? → quotation
// → contract → project) → stakeholders + competitors → activity → win/loss.

interface Opportunity {
  id: string; title: string; value: number; stage: string; winProbability: number;
  closeDate: string | null; requiresTender: boolean; ownerId: string | null; nextAction: string | null;
  accountId: string | null; accountName: string | null;
  budgetConfirmed: boolean; authorityConfirmed: boolean; needConfirmed: boolean; timelineConfirmed: boolean;
  competitors: string | null; source: string | null; lossReason: string | null; createdAt: string;
}
interface Stakeholder { id: string; name: string; jobTitle: string | null; stakeholderRole: string | null; relationshipStrength: string | null; isPrimary: boolean }
interface Step { key: string; label: string; reached: boolean; count: number; value: number | null; href: string | null }
interface ActivityRec { id: string; type: string; subject: string; status: string; dueDate: string | null; createdAt: string }

interface QuotationLite { id: string; quoteNumber: string; status: string; total: number }

interface Payload {
  opportunity: Opportunity;
  account: { id: string; name: string; status: string } | null;
  stakeholders: Stakeholder[];
  quotations: QuotationLite[];
  activities: ActivityRec[];
  qualification: { budget: boolean; authority: boolean; need: boolean; timeline: boolean; score: number };
  route: 'tender' | 'direct';
  progression: Step[];
  outcome: { status: 'open' | 'won' | 'lost'; lossReason: string | null; contractedValue: number };
  /** G2 — resolved server-side from the activity stream; render this, never re-derive the rule. */
  nextAction: { subject: string | null; dueDate: string | null; ownerId: string | null; fromActivity: boolean };
  attention: { active: boolean; gaps: string[]; needsAttention: boolean };
  /** G5 — the next-stage gate, resolved server-side. Rendered as-is; the client never re-derives it. */
  stageGate: StageGateView | null;
}

const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
const d = (iso: string): string => new Date(iso).toLocaleDateString();

const STAGE_OPTIONS = ['qualification', 'proposal', 'negotiation', 'won', 'lost'];
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

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/summary`, { cache: 'no-store' });
    if (!res.ok) { setErr('Failed to load the opportunity'); return; }
    setData(await res.json());
  }, [opportunityId]);

  useEffect(() => { void load(); }, [load]);

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

  const { opportunity: o, account, stakeholders, quotations, activities, qualification, route, progression, outcome, nextAction, attention, stageGate } = data;
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
  const situationText = `${cap(o.stage)} · ${o.winProbability}% win · AED ${aed(o.value)}${o.closeDate ? ` · close ${d(o.closeDate)}` : ''}`;

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
    nba = { label: '→ Generate quotation', hint: 'Won — turn it into a quote', onClick: () => { void fetch(`/api/crm/opportunities/${o.id}/convert-to-quotation`, { method: 'POST' }).then(() => load()); } };
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
      {closing && (
        <>
          <input autoFocus value={closing.reason} placeholder={closing.stage === 'won' ? 'Why did we win?' : 'Why did we lose?'}
            onChange={(e) => setClosing({ ...closing, reason: e.target.value })} style={{ ...st.input, width: 220, marginBottom: 0 }} />
          <button disabled={busy || !closing.reason.trim()} style={st.actionBtn}
            onClick={() => {
              void patch({ stage: closing.stage, [closing.stage === 'won' ? 'winReason' : 'lossReason']: closing.reason.trim() })
                .then((ok) => { if (ok) setClosing(null); });
            }}>
            Confirm {closing.stage} ✓
          </button>
          <button disabled={busy} style={st.ghostBtn} onClick={() => setClosing(null)}>Cancel</button>
        </>
      )}
      {o.stage === 'won' && !o.requiresTender && (
        <button disabled={busy} onClick={() => { void fetch(`/api/crm/opportunities/${o.id}/convert-to-quotation`, { method: 'POST' }).then(() => load()); }} style={st.actionBtn}>→ Quotation</button>
      )}
      {err && <span style={{ color: 'var(--bad)', fontSize: 12.5, fontWeight: 600 }}>{err}</span>}
    </>
  );

  const kpis: KpiItem[] = [
    { label: 'Value', value: `AED ${aed(o.value)}`, tone: 'accent' },
    { label: 'Win probability', value: `${o.winProbability}%` },
    { label: 'Qualification', value: `${qualification.score}/4`, tone: qualification.score < 2 ? 'warn' : 'neutral' },
    { label: 'Expected close', value: o.closeDate ? d(o.closeDate) : '—' },
    { label: 'Owner', value: o.ownerId ?? 'Unassigned' },
    { label: 'Contracted', value: `AED ${aed(outcome.contractedValue)}`, tone: outcome.contractedValue > 0 ? 'good' : 'neutral' },
  ];

  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'qualification', label: 'Qualification' },
    { id: 'scope', label: 'Scope' },
    { id: 'stakeholders', label: 'Stakeholders', count: stakeholders.length },
    { id: 'quotation', label: 'Commercial', count: quotations.length },
    { id: 'journey', label: 'Journey' },
    { id: 'winplan', label: 'Win Plan' },
    { id: 'depth', label: 'Deal Depth' },
    { id: 'activity', label: 'Activity' },
  ];

  const insights: Insight[] = [];
  if (attention?.gaps?.length) insights.push({ tone: 'warn', title: 'Needs attention', detail: attention.gaps.join(', ') });
  if (nextAction.subject) insights.push({ tone: 'accent', title: 'Next action', detail: `${nextAction.subject}${nextAction.dueDate ? ` · due ${d(nextAction.dueDate)}` : ''}` });
  if (qualification.score < 2) insights.push({ tone: 'warn', title: 'Weakly qualified', detail: `BANT ${qualification.score}/4 — confirm budget, authority, need, timing.`, action: { label: 'Qualify', onClick: () => setTab('qualification') } });
  if (outcome.status === 'open') insights.push({ tone: 'neutral', title: 'Outcome open', detail: 'Move the stage to Won or Lost to capture the result.' });
  if (competitors.length) insights.push({ tone: 'neutral', title: 'Competitive deal', detail: `Against: ${competitors.join(', ')}` });

  return (
    <RecordShell
      header={<RecordHeader title={o.title} status={OUTCOME.label} statusTone={OUTCOME.tone} meta={meta} score={{ value: `${o.winProbability}%`, label: 'Win prob', badge: `${qualification.score}/4 BANT`, badgeTone: qualification.score < 2 ? 'warn' : 'good' }} actions={actions} />}
      kpis={kpis}
      situation={
        <SituationBand
          situation={situationText}
          health={health}
          missing={missing}
          gate={stageGate ?? undefined}
          action={nba}
          outcome={outcome.status === 'open' ? { onSelect: logOutcome, busy, note: outcomeNote } : undefined}
        />
      }
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      aside={<InsightsPanel insights={insights} />}
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
            {outcome.status === 'won' && <p style={st.muted}>Contracted value AED {aed(outcome.contractedValue)}{o.competitors ? ` · beat: ${o.competitors}` : ''}.</p>}
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
                Next action: <b style={{ color: 'var(--fg)' }}>{nextAction.subject}</b>
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

      {tab === 'scope' && <PreAwardPanel opportunityId={o.id} />}
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
                ? <button style={st.linkBtn} onClick={() => { void fetch(`/api/crm/opportunities/${o.id}/convert-to-quotation`, { method: 'POST' }).then(() => load()); }}>generate one from this deal →</button>
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
        <RecordCard title="Activity timeline">
          <Timeline recordId={o.id} />
          {activities.length === 0 && <p style={st.muted}>No activities logged yet — <a href="/crm/activities" style={st.link}>log the next step →</a></p>}
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
  routePill: { fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px', color: 'var(--fg)' } as CSSProperties,
  metaLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' } as CSSProperties,
  select: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', padding: '5px 9px', fontSize: 12.5, textTransform: 'capitalize' } as CSSProperties,
  actionBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', background: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
  ghostBtn: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', padding: '7px 6px' } as CSSProperties,
  stats: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginBottom: 12 } as CSSProperties,
  section: { padding: '12px 16px', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 14 } as CSSProperties,
  sectionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--accent)', fontWeight: 800, marginBottom: 8 } as CSSProperties,
  chainRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 } as CSSProperties,
  chainNode: { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', color: 'var(--muted)' } as CSSProperties,
  chainNodeOn: { color: 'var(--fg)', borderColor: 'var(--accent)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 } as CSSProperties,
  block: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--panel)' } as CSSProperties,
  blockTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 800, marginBottom: 8 } as CSSProperties,
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  competitorChip: { fontSize: 12, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px', background: 'var(--panel-2, var(--panel))' } as CSSProperties,
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', padding: '6px 10px', fontSize: 12.5 } as CSSProperties,
  stkRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 } as CSSProperties,
  rolePill: { fontSize: 10.5, border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px', color: 'var(--fg)' } as CSSProperties,
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
