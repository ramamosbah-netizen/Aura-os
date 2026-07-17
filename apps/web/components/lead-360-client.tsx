'use client';

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LEAD_QUALIFICATION_DIMENSIONS, LEAD_QUALIFICATION_LABELS, elvSystemLabel, type ElvSystem } from '@aura/shared';
import CreateDrawer from './ui/create-drawer';
import LeadConvertDrawer from './lead-convert-drawer';
import Timeline from './timeline';
import {
  RecordShell, RecordHeader, ActionButton, RecordCard, InfoRow, CardGrid, InsightsPanel,
  RecordBand, RecordSituation, RecordNextAction, RecordHealth, RecordMissing, RecordOutcome,
  useTab, type Tone, type KpiItem, type Insight, type TabDef, type MetaItem,
  type HealthState, type NextBestAction,
} from './crm/record-shell';

// Lead 360 — the acquisition command center for a single lead, expressed on the shared
// CRM record-shell so it reads identically to every other 360 page: Header + Actions,
// KPIs, fixed Tabs (Overview / Qualification / Convert), a persistent Insights rail, and
// the Timeline always at the foot. Everything to work and qualify the lead in one place.

interface Lead {
  id: string; name: string; companyName: string | null; email: string | null; phone: string | null;
  status: string; source: string | null; assignedTo: string | null; firstRespondedAt: string | null;
  convertedOpportunityId: string | null; convertedAt: string | null; signalId: string | null;
  qualificationNotes: string | null; qualificationAssessedBy: string | null; qualificationAssessedAt: string | null;
  requirement: string | null; systems: string[] | null; sector: string | null; projectName: string | null;
  projectLocation: string | null; consultant: string | null; mainContractor: string | null;
  estimatedValue: number | null; projectStage: string | null; expectedTimeline: string | null; createdAt: string;
}
interface Reason { key: string; label: string; value: number | null }
interface Assessment {
  score: number; confidence: string; coverage: { rated: number; total: number };
  recommendation: 'QUALIFY' | 'REVIEW' | 'DISQUALIFY'; strengths: Reason[]; gaps: Reason[];
}
interface Qualification { dimensions: Record<string, number>; notes: string | null; assessment: Assessment }
interface AccountLite { id: string; name: string }
interface TeamUser { username: string; roleLabel?: string }

const STATUS_LABEL: Record<string, string> = {
  new: 'New', verified: 'Verified', assigned: 'Assigned', contacted: 'Contacted',
  qualifying: 'Qualifying', qualified: 'Qualified', nurturing: 'Nurturing',
  disqualified: 'Disqualified', converted: 'Converted',
};
const REC_TONE: Record<string, Tone> = { QUALIFY: 'good', REVIEW: 'warn', DISQUALIFY: 'bad' };
const scoreTone = (n: number): Tone => (n >= 70 ? 'good' : n >= 40 ? 'warn' : 'bad');
const scoreColor = (n: number): string => (n >= 70 ? 'var(--good)' : n >= 40 ? 'var(--warn, #d97706)' : 'var(--bad)');
const statusTone = (s: string): Tone => (s === 'converted' ? 'good' : s === 'disqualified' ? 'bad' : s === 'qualified' ? 'accent' : 'neutral');
const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
const d = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : '—');
const daysSince = (iso: string): number => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export default function Lead360Client({ lead, qualification, accounts }: {
  lead: Lead;
  qualification: Qualification | null;
  accounts: AccountLite[];
}) {
  const router = useRouter();
  const [tab, setTab] = useTab('overview');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<TeamUser | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [dims, setDims] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState(lead.qualificationNotes ?? '');
  // Outcome Loop — capture what happened after acting so no lead goes dead.
  const [outcomeNote, setOutcomeNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/workspace/me', { cache: 'no-store' }).catch(() => null);
      if (r?.ok) { const m = await r.json().catch(() => null); if (m?.username) setMe(m); }
    })();
  }, []);

  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const k of LEAD_QUALIFICATION_DIMENSIONS) {
      const v = qualification?.dimensions?.[k];
      seed[k] = typeof v === 'number' ? String(v) : '';
    }
    setDims(seed);
  }, [qualification]);

  const converted = !!lead.convertedOpportunityId;
  const a = qualification?.assessment;
  const assessed = !!a && a.coverage.rated > 0;

  const patch = async (body: Record<string, unknown>, note?: string): Promise<void> => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const dj = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(dj.message ?? dj.error ?? 'Update failed'); return; }
      if (note) setMsg(note);
      router.refresh();
    } catch { setErr('CRM API unreachable'); } finally { setBusy(false); }
  };

  const saveAssessment = async (): Promise<void> => {
    setBusy(true); setErr(null); setMsg(null);
    const dimensions: Record<string, number | null> = {};
    for (const k of LEAD_QUALIFICATION_DIMENSIONS) {
      const raw = dims[k]?.trim();
      dimensions[k] = raw === '' || raw === undefined ? null : Math.max(0, Math.min(100, Number(raw)));
    }
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/qualification`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dimensions, notes: notes.trim() || undefined }),
      });
      const dj = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(dj.message ?? dj.error ?? 'Assessment failed'); return; }
      setAssessing(false); setMsg('Qualification updated.'); router.refresh();
    } catch { setErr('CRM API unreachable'); } finally { setBusy(false); }
  };

  const editFields = useMemo(() => [
    { name: 'name', label: 'Primary contact', kind: 'text' as const, required: true, span: 2 as const },
    { name: 'companyName', label: 'Company / account', kind: 'text' as const, span: 2 as const },
    { name: 'email', label: 'Email', kind: 'text' as const },
    { name: 'phone', label: 'Phone', kind: 'text' as const },
    { name: 'estimatedValue', label: 'Expected value (AED)', kind: 'number' as const },
    { name: 'expectedTimeline', label: 'Expected timeline', kind: 'text' as const },
    { name: 'requirement', label: 'Interest / requirement', kind: 'textarea' as const, span: 2 as const },
    { name: 'projectName', label: 'Project', kind: 'text' as const },
    { name: 'projectLocation', label: 'Location', kind: 'text' as const },
    { name: 'consultant', label: 'Consultant', kind: 'text' as const },
    { name: 'mainContractor', label: 'Main contractor', kind: 'text' as const },
  ], []);
  const editInitial = {
    name: lead.name, companyName: lead.companyName ?? '', email: lead.email ?? '', phone: lead.phone ?? '',
    estimatedValue: lead.estimatedValue != null ? String(lead.estimatedValue) : '', expectedTimeline: lead.expectedTimeline ?? '',
    requirement: lead.requirement ?? '', projectName: lead.projectName ?? '', projectLocation: lead.projectLocation ?? '',
    consultant: lead.consultant ?? '', mainContractor: lead.mainContractor ?? '',
  };

  // ── Header meta + actions ─────────────────────────────────────────────────
  const meta: MetaItem[] = [
    ...(lead.companyName ? [{ value: <b style={{ color: 'var(--fg)' }}>{lead.companyName}</b> }] : []),
    ...(lead.source ? [{ label: 'Source', value: lead.source.replace('_', ' ') }] : []),
    { label: 'Captured', value: d(lead.createdAt) },
    {
      label: 'Owner',
      value: (
        <>
          {lead.assignedTo ?? <span style={{ color: 'var(--muted)' }}>Unassigned</span>}
          {me && lead.assignedTo !== me.username && !converted && (
            <button disabled={busy} onClick={() => void patch({ assignedTo: me.username }, 'Assigned to you.')} style={s.inlineBtn}>Assign to me</button>
          )}
        </>
      ),
    },
  ];

  const actions = (
    <>
      {!converted && lead.status !== 'qualified' && (
        <ActionButton kind="primary" disabled={busy} onClick={() => void patch({ status: 'qualified' }, 'Lead marked qualified.')}>Mark qualified ✓</ActionButton>
      )}
      {!converted && <LeadConvertDrawer lead={lead} accounts={accounts} onDone={() => { setMsg('Converted to an opportunity.'); router.refresh(); }} />}
      <CreateDrawer entity="Lead" mode="edit" buttonLabel="Edit" subtitle="Update this lead's details." endpoint={`/api/crm/leads/${lead.id}`} fields={editFields} initialValues={editInitial} onSaved={() => router.refresh()} />
      {!converted && lead.status !== 'disqualified' && (
        <ActionButton disabled={busy} onClick={() => void patch({ status: 'disqualified' }, 'Lead disqualified.')}>Disqualify</ActionButton>
      )}
      {err && <span style={{ color: 'var(--bad)', fontSize: 13 }}>{err}</span>}
      {msg && <span style={{ color: 'var(--good)', fontSize: 13 }}>{msg}</span>}
    </>
  );

  const header = (
    <RecordHeader
      title={lead.name}
      status={STATUS_LABEL[lead.status] ?? lead.status}
      statusTone={statusTone(lead.status)}
      meta={meta}
      score={assessed ? { value: a!.score, label: 'Qual. score', badge: a!.recommendation, badgeTone: REC_TONE[a!.recommendation] } : undefined}
      actions={actions}
    />
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis: KpiItem[] = [
    { label: 'Qual. score', value: assessed ? a!.score : '—', tone: assessed ? scoreTone(a!.score) : 'neutral' },
    { label: 'Verdict', value: assessed ? a!.recommendation : 'Unrated', tone: assessed ? REC_TONE[a!.recommendation] : 'neutral' },
    { label: 'Coverage', value: `${a?.coverage.rated ?? 0}/${a?.coverage.total ?? 8}`, hint: 'Dimensions rated' },
    { label: 'Est. value', value: lead.estimatedValue != null ? `AED ${aed(lead.estimatedValue)}` : '—', tone: 'accent' },
    { label: 'Age', value: `${daysSince(lead.createdAt)}d`, hint: 'Days since captured' },
    { label: 'First response', value: lead.firstRespondedAt ? d(lead.firstRespondedAt) : 'pending', tone: lead.firstRespondedAt ? 'neutral' : 'warn' },
  ];

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'qualification', label: 'Qualification' },
    { id: 'convert', label: converted ? 'Converted' : 'Convert' },
  ];

  // ── Insights rail (derived, honest — no black box) ─────────────────────────
  const insights: Insight[] = [];
  if (converted) {
    insights.push({ tone: 'good', title: 'Converted', detail: `Became an opportunity ${d(lead.convertedAt)}.`, action: { label: 'Open the opportunity', href: `/crm/opportunities/${lead.convertedOpportunityId}` } });
  } else {
    if (!assessed) insights.push({ tone: 'warn', title: 'Not qualified yet', detail: 'Score the eight dimensions to get a verdict.', action: { label: 'Assess now', onClick: () => { setTab('qualification'); setAssessing(true); } } });
    else if (a!.recommendation === 'QUALIFY') insights.push({ tone: 'good', title: 'Ready to convert', detail: `Score ${a!.score} · the engine recommends QUALIFY.`, action: { label: 'Qualify & convert', onClick: () => setTab('convert') } });
    else if (a!.recommendation === 'DISQUALIFY') insights.push({ tone: 'bad', title: 'Weak fit', detail: `Score ${a!.score} · consider disqualifying.` });
    if (assessed && a!.gaps.length) insights.push({ tone: 'warn', title: 'Go find out', detail: a!.gaps.map((g) => g.label).join(', '), action: { label: 'Update assessment', onClick: () => { setTab('qualification'); setAssessing(true); } } });
    if (!lead.email && !lead.phone) insights.push({ tone: 'warn', title: 'No contact channel', detail: 'No email or phone captured yet.' });
    if (lead.assignedTo && !lead.firstRespondedAt) insights.push({ tone: 'warn', title: 'Respond — SLA running', detail: 'Assigned but no first response logged.' });
  }

  // ── Universal Object Shell — Situation / Business Health / Missing Info / Next Best Action ──
  const situationText = `${STATUS_LABEL[lead.status] ?? lead.status} · ${daysSince(lead.createdAt)}d old${lead.estimatedValue != null ? ` · AED ${aed(lead.estimatedValue)}` : ''}`;

  let health: HealthState;
  if (converted) health = { label: 'Converted', tone: 'good' };
  else if (assessed && a!.recommendation === 'QUALIFY') health = { label: 'Ready to convert', tone: 'good' };
  else if (assessed && a!.recommendation === 'DISQUALIFY') health = { label: 'Weak fit', tone: 'bad', reasons: a!.gaps.map((g) => g.label) };
  else if (assessed) health = { label: 'Needs review', tone: 'warn', reasons: a!.gaps.map((g) => g.label) };
  else health = { label: 'Unrated', tone: 'warn', reasons: ['not assessed yet'] };

  // Missing Information — what's blocking qualification/conversion.
  const missing: string[] = [];
  if (!converted) {
    if (!assessed) missing.push('Qualification');
    if (!lead.email && !lead.phone) missing.push('Contact channel');
    if (!lead.assignedTo) missing.push('Owner');
    if (lead.assignedTo && !lead.firstRespondedAt) missing.push('First response');
    if (assessed) for (const g of a!.gaps.slice(0, 3)) missing.push(g.label);
  }

  // The ONE next best action.
  let nba: NextBestAction | undefined;
  if (converted) nba = { label: 'Open the opportunity →', href: `/crm/opportunities/${lead.convertedOpportunityId}` };
  else if (!assessed) nba = { label: 'Assess this lead', hint: 'Score the eight dimensions', onClick: () => { setTab('qualification'); setAssessing(true); } };
  else if (a!.recommendation === 'QUALIFY') nba = { label: 'Qualify & convert', hint: `Score ${a!.score} — engine says QUALIFY`, onClick: () => setTab('convert') };
  else nba = { label: 'Update assessment', hint: a!.gaps.length ? `Find out: ${a!.gaps.map((g) => g.label).join(', ')}` : undefined, onClick: () => { setTab('qualification'); setAssessing(true); } };

  // Outcome Loop — writes a real activity linked to this lead (§17 activity stream).
  const logOutcome = async (choiceId: string): Promise<void> => {
    const who = lead.name;
    const plan: Record<string, { type: string; subject: string; status?: string }> = {
      completed: { type: 'note', subject: `Outcome — reached ${who}`, status: 'completed' },
      failed: { type: 'note', subject: `Outcome — ${who}: no answer`, status: 'completed' },
      follow_up: { type: 'follow_up', subject: `Follow up: ${who}` },
      reschedule: { type: 'task', subject: `Reschedule: ${who}` },
    };
    const act = plan[choiceId];
    if (!act) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/crm/activities', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: act.type, subject: act.subject, relatedType: 'lead', relatedId: lead.id, relatedName: lead.name, status: act.status }),
      });
      if (!res.ok) { setErr('Could not log the outcome'); return; }
      setOutcomeNote(`Logged: ${act.subject}`);
      router.refresh();
    } catch { setErr('CRM API unreachable'); } finally { setBusy(false); }
  };

  return (
    <RecordShell
      header={header}
      kpis={kpis}
      situation={
        <RecordBand tone={health?.tone}>
          <RecordSituation situation={situationText} />
          {nba && <RecordNextAction action={nba} />}
          {health && <RecordHealth health={health} />}
          <RecordMissing items={missing} />
          {!converted && <RecordOutcome outcome={{ onSelect: logOutcome, busy, note: outcomeNote }} />}
        </RecordBand>
      }
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      aside={<InsightsPanel insights={insights} />}
      footer={<RecordCard title="Activity timeline" span={2}><Timeline recordId={lead.id} /></RecordCard>}
    >
      {tab === 'overview' && (
        <CardGrid>
          <RecordCard title="Contact">
            <InfoRow label="Email" value={lead.email ? <a href={`mailto:${lead.email}`} style={s.link}>{lead.email}</a> : '—'} />
            <InfoRow label="Phone" value={lead.phone ? <a href={`tel:${lead.phone}`} style={s.link}>{lead.phone}</a> : '—'} />
            <InfoRow label="Company" value={lead.companyName ?? '—'} />
            <InfoRow label="First response" value={lead.firstRespondedAt ? d(lead.firstRespondedAt) : <span style={{ color: 'var(--warn, #d97706)' }}>not yet</span>} />
          </RecordCard>
          <RecordCard title="The job (ELV context)">
            <InfoRow label="Requirement" value={lead.requirement ?? '—'} />
            <InfoRow label="Systems" value={lead.systems?.length ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{lead.systems.map((x) => <span key={x} style={s.tag}>{elvSystemLabel(x as ElvSystem)}</span>)}</span> : '—'} />
            <InfoRow label="Sector" value={lead.sector ?? '—'} />
            <InfoRow label="Project" value={lead.projectName ?? '—'} />
            <InfoRow label="Location" value={lead.projectLocation ?? '—'} />
            <InfoRow label="Consultant" value={lead.consultant ?? '—'} />
            <InfoRow label="Main contractor" value={lead.mainContractor ?? '—'} />
            <InfoRow label="Est. value" value={lead.estimatedValue != null ? `AED ${aed(lead.estimatedValue)}` : '—'} />
            <InfoRow label="Timeline" value={lead.expectedTimeline ?? '—'} />
          </RecordCard>
        </CardGrid>
      )}

      {tab === 'qualification' && (
        <RecordCard title="Qualification" action={!converted ? <button style={s.linkBtn} onClick={() => setAssessing((v) => !v)}>{assessing ? 'Cancel' : assessed ? 'Update assessment' : 'Assess this lead'}</button> : undefined}>
          {!assessed ? (
            !assessing && <p style={s.muted}>Not assessed yet — score the eight dimensions to get a QUALIFY / REVIEW / DISQUALIFY verdict.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ height: 10, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${a!.score}%`, height: '100%', background: scoreColor(a!.score) }} />
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Confidence <b style={{ color: 'var(--fg)' }}>{a!.confidence}</b> · {a!.coverage.rated}/{a!.coverage.total} rated</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={s.subhead}>Strengths</div>
                  {a!.strengths.length ? a!.strengths.map((r) => <Chip key={r.key} label={r.label} value={r.value} tone="good" />) : <span style={s.muted}>None yet.</span>}
                </div>
                <div>
                  <div style={s.subhead}>Gaps — go find out</div>
                  {a!.gaps.length ? a!.gaps.map((r) => <Chip key={r.key} label={r.label} value={r.value} tone="bad" />) : <span style={s.muted}>None.</span>}
                </div>
              </div>
              {lead.qualificationNotes && <p style={{ ...s.muted, marginTop: 10, fontStyle: 'italic' }}>“{lead.qualificationNotes}”</p>}
            </>
          )}

          {assessing && (
            <div style={s.assessBox}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {LEAD_QUALIFICATION_DIMENSIONS.map((k) => (
                  <label key={k} style={s.dimRow}>
                    <span style={{ fontSize: 12.5 }}>{LEAD_QUALIFICATION_LABELS[k]}</span>
                    <input type="number" min={0} max={100} placeholder="0–100" value={dims[k] ?? ''} onChange={(e) => setDims((p) => ({ ...p, [k]: e.target.value }))} style={s.dimInput} />
                  </label>
                ))}
              </div>
              <textarea placeholder="Reasoning behind the numbers (optional)…" value={notes} onChange={(e) => setNotes(e.target.value)} style={s.notes} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <ActionButton onClick={() => setAssessing(false)} disabled={busy}>Cancel</ActionButton>
                <ActionButton kind="primary" onClick={() => void saveAssessment()} disabled={busy}>Save assessment</ActionButton>
              </div>
            </div>
          )}
        </RecordCard>
      )}

      {tab === 'convert' && (
        <RecordCard title={converted ? 'Conversion' : 'Qualify & Convert'}>
          {converted ? (
            <div>
              <p style={s.muted}>This lead was converted {d(lead.convertedAt)} — it is terminal and cannot convert again.</p>
              <a href={`/crm/opportunities/${lead.convertedOpportunityId}`} style={{ ...s.link, fontWeight: 600 }}>Open the opportunity →</a>
            </div>
          ) : (
            <div>
              <p style={{ ...s.muted, marginBottom: 12 }}>
                Converting links this lead to an <b style={{ color: 'var(--fg)' }}>Account</b> and a <b style={{ color: 'var(--fg)' }}>Primary Contact</b> (linking an existing match or creating fresh), then opens the <b style={{ color: 'var(--fg)' }}>Opportunity</b> — all in one transactional step, with lineage preserved.
              </p>
              <LeadConvertDrawer lead={lead} accounts={accounts} onDone={() => { setMsg('Converted to an opportunity.'); router.refresh(); }} />
            </div>
          )}
        </RecordCard>
      )}
    </RecordShell>
  );
}

function Chip({ label, value, tone }: { label: string; value: number | null; tone: 'good' | 'bad' }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 12, margin: '0 6px 6px 0' }}>
      {label}
      <b style={{ color: tone === 'good' ? 'var(--good)' : 'var(--muted)' }}>{value === null ? 'unrated' : value}</b>
    </span>
  );
}

const s: Record<string, CSSProperties> = {
  inlineBtn: { marginLeft: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--accent)', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' },
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  link: { color: 'var(--accent)', textDecoration: 'none' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 },
  tag: { fontSize: 11, border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px' },
  subhead: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 6 },
  assessBox: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 },
  dimRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dimInput: { width: 80, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', padding: '5px 8px', fontSize: 12.5, outline: 'none' },
  notes: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', padding: '8px 10px', fontSize: 13, minHeight: 54, outline: 'none', resize: 'vertical' },
};
