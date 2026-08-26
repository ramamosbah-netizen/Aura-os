'use client';

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LEAD_QUALIFICATION_DIMENSIONS, LEAD_QUALIFICATION_LABELS, elvSystemLabel, type ElvSystem } from '@aura/shared';
import CreateDrawer from './ui/create-drawer';
import LeadConvertDrawer from './lead-convert-drawer';
import Timeline from './timeline';
import { requestQualifyAssist } from '@/lib/qualify-assist';
import { buildOutreach, toE164Digits, mailtoHref, whatsappHref, requestOutreachDraft } from '@/lib/lead-outreach';
import {
  RecordShell, RecordHeader, ActionButton, RecordCard, InfoRow, CardGrid, InsightsPanel,
  RecordBand, RecordSituation, RecordNextAction, RecordHealth, RecordMissing, RecordOutcome,
  useTab, type Tone, type KpiItem, type Insight, type TabDef, type MetaItem,
  type HealthState, type NextBestAction,
} from './crm/record-shell';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

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
// Backend-scoped assignable users — what THIS caller may assign the lead to (self-only unless they
// hold the reassign-others capability). The UI renders only this; the assign write re-checks.
interface AssignableUser { id: string; displayName: string; email: string | null; self: boolean }
// Context-only DMS documents linked to this lead (aggregateType 'crm.lead').
interface DocRow { id: string; title: string; kind: string; currentVersion?: number; updatedAt?: string }
// Conversion readiness — read from the SAME resolveIdentity engine the backend converts with.
interface IdMatch { id: string; confidence: string; reasons: string[] }
interface IdRes { best: string; matches: IdMatch[] }
interface ConvertPreview { alreadyConverted: boolean; account: IdRes; contact: IdRes }

const STATUS_LABEL: Record<string, string> = {
  new: 'New', verified: 'Verified', assigned: 'Assigned', contacted: 'Contacted',
  qualifying: 'Qualifying', qualified: 'Qualified', nurturing: 'Nurturing',
  disqualified: 'Disqualified', converted: 'Converted',
};
const REC_TONE: Record<string, Tone> = { QUALIFY: 'good', REVIEW: 'warn', DISQUALIFY: 'bad' };
const scoreTone = (n: number): Tone => (n >= 70 ? 'good' : n >= 40 ? 'warn' : 'bad');
const scoreColor = (n: number): string => (n >= 70 ? 'var(--good)' : n >= 40 ? 'var(--warn, var(--warn))' : 'var(--bad)');
const statusTone = (s: string): Tone => (s === 'converted' ? 'good' : s === 'disqualified' ? 'bad' : s === 'qualified' ? 'accent' : 'neutral');
const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
const d = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE }) : '—');
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
  const [assessing, setAssessing] = useState(false);
  const [dims, setDims] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState(lead.qualificationNotes ?? '');
  // Outcome Loop — capture what happened after acting so no lead goes dead.
  const [outcomeNote, setOutcomeNote] = useState<string | null>(null);
  // Context tabs (lazy): DMS documents + the conversion-readiness preview.
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [preview, setPreview] = useState<ConvertPreview | null>(null);
  // AURA Qualification Assist — read-only AI advice (cannot mutate the lead).
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  // Communication — an editable outreach draft, prefilled from the lead's facts.
  const draft = useMemo(() => buildOutreach(lead), [lead]);
  const [commSubject, setCommSubject] = useState(draft.subject);
  const [commMsg, setCommMsg] = useState(draft.body);
  const [suggBusy, setSuggBusy] = useState(false);
  // WhatsApp only when the number normalises to E.164 safely — otherwise we show a hint, never guess.
  const waDigits = toE164Digits(lead.phone);

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

  // Documents tab: read this lead's linked documents from the DMS (read-only, no store in CRM).
  useEffect(() => {
    if (tab !== 'documents' || docs !== null) return;
    void fetch(`/api/documents?aggregateType=crm.lead&aggregateId=${lead.id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('dms'))))
      .then((x: unknown) => setDocs(Array.isArray(x) ? (x as DocRow[]) : []))
      .catch(() => setDocs([]));
  }, [tab, docs, lead.id]);

  // Convert tab: read the conversion-readiness preview (same resolveIdentity engine as convert).
  useEffect(() => {
    if (tab !== 'overview' || preview !== null || converted) return;
    void fetch(`/api/crm/leads/${lead.id}/convert-preview`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('preview'))))
      .then((p: ConvertPreview) => setPreview(p))
      .catch(() => setPreview(null));
  }, [tab, preview, converted, lead.id]);

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

  // AURA Qualification Assist — grounded on the lead's facts + assessment. READ-ONLY: it can only
  // return advice (questions / missing evidence / checks / next actions); it never mutates the lead.
  const askAura = async (): Promise<void> => {
    setAiBusy(true); setAiErr(null); setAiText(null);
    try {
      const text = await requestQualifyAssist(
        {
          name: lead.name, companyName: lead.companyName, source: lead.source, status: lead.status,
          requirement: lead.requirement, systems: lead.systems, sector: lead.sector, projectName: lead.projectName,
          projectLocation: lead.projectLocation, consultant: lead.consultant, mainContractor: lead.mainContractor,
          estimatedValue: lead.estimatedValue, expectedTimeline: lead.expectedTimeline,
        },
        a ? { score: a.score, recommendation: a.recommendation, coverage: a.coverage, gaps: a.gaps } : null,
      );
      setAiText(text);
    } catch (e) { setAiErr((e as Error).message); } finally { setAiBusy(false); }
  };

  // Regenerate the outreach message with AURA (real /api/ai seam only — see lead-outreach). On any
  // failure the current editable draft is KEPT (never wiped, never called "AI-generated").
  const suggestMessage = async (): Promise<void> => {
    setSuggBusy(true);
    try {
      const text = await requestOutreachDraft(lead);
      if (text) setCommMsg(text);
    } catch { /* keep the existing draft */ } finally { setSuggBusy(false); }
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
    ...(lead.companyName ? [{ value: <b style={{ color: 'var(--text)' }}>{lead.companyName}</b> }] : []),
    ...(lead.source ? [{ label: 'Source', value: lead.source.replace('_', ' ') }] : []),
    { label: 'Captured', value: d(lead.createdAt) },
    {
      label: 'Owner',
      value: (
        <>
          {lead.assignedTo ?? <span style={{ color: 'var(--muted)' }}>Unassigned</span>}
          {!converted && (
            <LeadAssignControl
              leadId={lead.id}
              currentOwner={lead.assignedTo}
              onDone={() => { setMsg('Assignment updated.'); router.refresh(); }}
            />
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
      {/* Convert is NOT a header shortcut — it lives in Overview with its readiness context. */}
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
    { id: 'communication', label: 'Communication' },
    { id: 'documents', label: 'Documents' },
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

  // Coverage of this rail: a CONVERTED lead is history, so the working rules no longer govern it.
  // Otherwise the rail may only claim "all clear" once the assessment actually ran — an unscored
  // lead is "not assessed", never "fine".
  const insightsAssessment = {
    attentionCount: insights.filter((i) => i.tone === 'warn' || i.tone === 'bad').length,
    applicable: !converted,
    required: ['the qualification assessment', 'a contact channel', ...(lead.assignedTo ? ['first-response SLA'] : [])],
    assessed: [...(assessed ? ['the qualification assessment'] : []), 'a contact channel', ...(lead.assignedTo ? ['first-response SLA'] : [])],
  };

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
      aside={<InsightsPanel insights={insights} assessment={insightsAssessment} context="a converted lead" />}
      footer={<RecordCard title="Activity timeline" span={2}><Timeline recordId={lead.id} /></RecordCard>}
    >
      {tab === 'overview' && (
        <>
          <CardGrid>
            <RecordCard title="Contact">
              <InfoRow label="Email" value={lead.email ? <a href={`mailto:${lead.email}`} style={s.link}>{lead.email}</a> : '—'} />
              <InfoRow label="Phone" value={lead.phone ? <a href={`tel:${lead.phone}`} style={s.link}>{lead.phone}</a> : '—'} />
              <InfoRow label="Company" value={lead.companyName ?? '—'} />
              <InfoRow label="First response" value={lead.firstRespondedAt ? d(lead.firstRespondedAt) : <span style={{ color: 'var(--warn, var(--warn))' }}>not yet</span>} />
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
          {/* Qualify & Convert lives WITH the Overview — the primary outcome of a lead, next to its
              context. It shows conversion readiness (backend owns eligibility) and the convert action. */}
          <div style={{ marginTop: 14 }}>
            <RecordCard title={converted ? 'Conversion' : 'Qualify & Convert'}>
              {converted ? (
                <div>
                  <p style={s.muted}>This lead was converted {d(lead.convertedAt)} — it is terminal and cannot convert again. Traceability is preserved: Lead → Opportunity → Quote/Tender → Won → Project.</p>
                  <a href={`/crm/opportunities/${lead.convertedOpportunityId}`} style={{ ...s.link, fontWeight: 600 }}>Open Opportunity 360 →</a>
                </div>
              ) : (
                <div>
                  {/* Conversion readiness — the BACKEND owns eligibility; this only SHOWS the signals it
                      will evaluate. On convert the API decides (qualified? already converted? identity
                      match? allowed?) and, if it refuses, returns the reason. React never gates. */}
                  <div style={s.readyBox}>
                    <div style={s.readyTitle}>Conversion readiness</div>
                    <ReadyRow label="Lifecycle status" ok={lead.status === 'qualified'} text={`${STATUS_LABEL[lead.status] ?? lead.status}${lead.status === 'qualified' ? ' — required to convert' : ' — must be Qualified to convert'}`} />
                    <ReadyRow label="Qualification assessment" text={assessed ? `${a!.recommendation} · ${a!.coverage.rated}/${a!.coverage.total} dimensions rated` : 'Not assessed (advisory — does not block convert)'} />
                    <ReadyRow label="Customer identity" text={idText(preview?.account.best)} />
                    <ReadyRow label="Contact identity" text={idText(preview?.contact.best)} />
                  </div>
                  <p style={{ ...s.muted, margin: '8px 0 0', fontSize: 11.5 }}>The engine recommends; a human qualifies. Convert is gated by the lifecycle status (backend-enforced), not by the assessment.</p>

                  {preview && (preview.account.matches.length > 0 || preview.contact.matches.length > 0) && (
                    <div style={s.dupBox}>
                      <div style={s.subhead}>Possible duplicate</div>
                      {preview.account.matches.map((m) => (
                        <div key={`a-${m.id}`} style={s.dupRow}>
                          <span><b>{accounts.find((x) => x.id === m.id)?.name ?? 'Customer'}</b> <span style={s.dupType}>Account · {m.confidence}</span></span>
                          <a href={`/crm/accounts/${m.id}`} style={s.link}>Open Customer →</a>
                        </div>
                      ))}
                      {preview.contact.matches.map((m) => (
                        <div key={`c-${m.id}`} style={s.dupRow}>
                          <span><b>Contact match</b> <span style={s.dupType}>Contact · {m.confidence}</span></span>
                          <a href={`/crm/contacts/${m.id}`} style={s.link}>Open Contact →</a>
                        </div>
                      ))}
                    </div>
                  )}

                  <p style={{ ...s.muted, margin: '12px 0' }}>
                    Converting links this lead to an <b style={{ color: 'var(--text)' }}>Account</b> and a <b style={{ color: 'var(--text)' }}>Primary Contact</b> (linking an existing match or creating fresh), then opens the <b style={{ color: 'var(--text)' }}>Opportunity</b> — one transactional step, lineage preserved. The backend decides eligibility; if it refuses, the reason shows above.
                  </p>
                  <LeadConvertDrawer lead={lead} accounts={accounts} onDone={() => { setMsg('Converted to an opportunity.'); router.refresh(); }} />
                </div>
              )}
            </RecordCard>
          </div>
        </>
      )}

      {tab === 'qualification' && (
        <RecordCard title="Qualification" action={!converted ? <button style={s.linkBtn} onClick={() => setAssessing((v) => !v)}>{assessing ? 'Cancel' : assessed ? 'Update assessment' : 'Assess this lead'}</button> : undefined}>
          <p style={s.pathNote}><b>Evidence → Assessment → Human decision → Lifecycle.</b> Each dimension is evidence you gather; the engine turns it into an <b>advisory</b> verdict (QUALIFY / REVIEW / DISQUALIFY) with coverage — it recommends, it never decides. <b>You</b> set the Lifecycle Status.</p>
          <div style={s.qualSplit}>
            <div style={s.qualCol}>
              <div style={s.subhead}>Lifecycle status — your decision</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: lead.status === 'qualified' ? 'var(--good)' : lead.status === 'disqualified' ? 'var(--bad)' : 'var(--text)' }}>{STATUS_LABEL[lead.status] ?? lead.status}</div>
            </div>
            <div style={s.qualCol}>
              <div style={s.subhead}>AURA assessment — advisory</div>
              <div style={{ fontSize: 13 }}>{assessed ? <><b style={{ color: a!.recommendation === 'QUALIFY' ? 'var(--good)' : a!.recommendation === 'DISQUALIFY' ? 'var(--bad)' : 'var(--warn, #d99a42)' }}>{a!.recommendation}</b> · {a!.score}/100 · {a!.coverage.rated}/{a!.coverage.total} rated</> : <span style={s.muted}>Not assessed</span>}</div>
            </div>
          </div>
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
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Confidence <b style={{ color: 'var(--text)' }}>{a!.confidence}</b> · {a!.coverage.rated}/{a!.coverage.total} rated</div>
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

          <div style={s.assistBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={s.subhead}>✦ AURA qualification assist</div>
              <button type="button" style={s.linkBtn} onClick={() => void askAura()} disabled={aiBusy}>{aiBusy ? 'Thinking…' : aiText !== null || aiErr ? 'Ask again' : 'Ask AURA to help qualify'}</button>
            </div>
            <p style={{ ...s.muted, marginTop: 0 }}>Not sure this lead is worth pursuing? AURA reviews the facts and evidence and suggests questions to ask, missing evidence, checks to run and next actions. Advisory only — it cannot change the status or convert.</p>
            {aiBusy && <p style={s.muted}>AURA is reviewing the lead facts and evidence…</p>}
            {aiErr && <p style={{ color: 'var(--bad)', fontSize: 12.5, margin: 0 }}>{aiErr}</p>}
            {!aiBusy && aiText !== null && (aiText.trim() ? <div style={s.assistText}>{aiText}</div> : <p style={s.muted}>AURA returned no suggestions for this lead.</p>)}
          </div>
        </RecordCard>
      )}

      {tab === 'communication' && (
        <RecordCard title="Communication">
          <p style={s.muted}>Reach this lead on their own channel with a ready draft, or open the internal <b style={{ color: 'var(--text)' }}>Communication Center</b> for team chat and mail.</p>

          {!lead.email && !lead.phone ? (
            <p style={{ ...s.muted, marginTop: 10 }}>No email or phone on file — add one with <b style={{ color: 'var(--text)' }}>Edit</b> to message this lead.</p>
          ) : (
            <div style={s.commBox}>
              <div style={s.commRow}>
                <label style={s.commLabel}>Suggested message</label>
                <button type="button" disabled={suggBusy} onClick={() => void suggestMessage()} style={s.inlineBtn}>
                  {suggBusy ? 'Drafting…' : '✨ Suggest with AURA'}
                </button>
              </div>
              <input
                value={commSubject}
                onChange={(e) => setCommSubject(e.target.value)}
                placeholder="Subject (email)"
                style={s.commInput}
              />
              <textarea value={commMsg} onChange={(e) => setCommMsg(e.target.value)} style={s.notes} rows={6} />
              <div style={s.commActions}>
                {lead.email && (
                  <a href={mailtoHref(lead.email, commSubject, commMsg)} style={s.commSend}>✉ Open in Email →</a>
                )}
                {waDigits && (
                  <a href={whatsappHref(waDigits, commMsg)} target="_blank" rel="noreferrer" style={s.commSendAlt}>WhatsApp →</a>
                )}
              </div>
              {lead.phone && !waDigits && (
                <p style={s.commHint}>WhatsApp needs an international number (e.g. +9715…). Add a country code in <b style={{ color: 'var(--text)' }}>Edit</b> to enable it.</p>
              )}
              <p style={s.commHint}>Opens your own mail app / WhatsApp with the recipient and this message prefilled — edit before sending. AURA prepares the message; it does not send it.</p>
            </div>
          )}

          <div style={{ margin: '14px 0 4px' }}>
            <ActionButton href="/my-work/communication">Open Communication Center →</ActionButton>
          </div>
          <InfoRow label="Email" value={lead.email ?? '—'} />
          <InfoRow label="Phone" value={lead.phone ?? '—'} />
        </RecordCard>
      )}

      {tab === 'documents' && (
        <RecordCard title="Documents">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
            <p style={{ ...s.muted, maxWidth: 520 }}>Documents linked to this lead in <b style={{ color: 'var(--text)' }}>Document Control</b> (the DMS). Read-only here — upload and versions live there.</p>
            <ActionButton href="/documents/control">Open Document Control →</ActionButton>
          </div>
          {docs === null ? (
            <p style={s.muted}>Loading documents…</p>
          ) : docs.length === 0 ? (
            <p style={s.muted}>No documents linked to this lead yet — attach them from Document Control.</p>
          ) : (
            docs.map((dc) => (
              <InfoRow key={dc.id} label={dc.title} value={<span style={s.muted}>{dc.kind?.replace(/[._]/g, ' ')}{dc.currentVersion != null ? ` · v${dc.currentVersion}` : ''}{dc.updatedAt ? ` · ${d(dc.updatedAt)}` : ''}</span>} />
            ))
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

function ReadyRow({ label, ok, text }: { label: string; ok?: boolean; text: string }) {
  const icon = ok === undefined ? '' : ok ? '✓ ' : '⚠ ';
  const color = ok === undefined ? 'var(--text)' : ok ? 'var(--good)' : 'var(--warn, #d99a42)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13, borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{icon}{text}</span>
    </div>
  );
}

const idText = (best?: string): string => {
  switch (best) {
    case 'EXACT': return '✓ Exact match';
    case 'PROBABLE': return '⚠ Probable match';
    case 'POSSIBLE': return '⚠ Possible match';
    case 'NONE': return 'No match — will create new';
    default: return 'Checking…';
  }
};

const s: Record<string, CSSProperties> = {
  inlineBtn: { marginLeft: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--accent)', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' },
  readyBox: { border: '1px solid var(--border)', borderRadius: 10, padding: '4px 12px 8px', background: 'var(--panel-2, var(--panel))' },
  readyTitle: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 800, padding: '8px 0 4px' },
  dupBox: { marginTop: 12, border: '1px solid #d99a42', borderRadius: 10, background: 'color-mix(in srgb, #d99a42 8%, var(--panel))', padding: 12 },
  dupRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 12.5, borderTop: '1px solid var(--border)' },
  dupType: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 6px' },
  pathNote: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.55 },
  qualSplit: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  qualCol: { border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--panel-2, var(--panel))' },
  assistBox: { marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' },
  assistText: { marginTop: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-2, var(--panel))', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  link: { color: 'var(--accent)', textDecoration: 'none' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 },
  tag: { fontSize: 11, border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px' },
  subhead: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 6 },
  assessBox: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 },
  dimRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dimInput: { width: 80, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '5px 8px', fontSize: 12.5, outline: 'none' },
  notes: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, minHeight: 54, outline: 'none', resize: 'vertical' },
  commBox: { display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0', border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--panel-2, var(--panel))' },
  commRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  commLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 800 },
  commInput: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, outline: 'none' },
  commActions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  commSend: { border: '1px solid var(--accent)', background: 'var(--accent-grad, var(--accent))', color: 'var(--accent-ink, #fff)', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  commSendAlt: { border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  commHint: { color: 'var(--muted)', fontSize: 11.5, margin: 0 },
  assignSelect: { marginLeft: 8, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '2px 6px', fontSize: 12, outline: 'none' },
  assignReason: { marginLeft: 6, width: 150, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '2px 8px', fontSize: 12, outline: 'none' },
};

/**
 * Assignment control — renders ONLY what the backend says this caller may do. It reads
 * `GET :id/assignable-users` (self-only for a rep; the eligible tenant members for a manager) and
 * writes through `PATCH :id/assign`, which re-authorizes and re-validates. The generic lead PATCH
 * can no longer change ownership, so this is the single UI path for it. A reassignment (moving off an
 * existing owner) requires a reason — enforced here and again on the server.
 */
function LeadAssignControl({ leadId, currentOwner, onDone }: {
  leadId: string;
  currentOwner: string | null;
  onDone: () => void;
}) {
  const [list, setList] = useState<AssignableUser[] | null>(null);
  const [sel, setSel] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/crm/leads/${leadId}/assignable-users`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('assignable'))))
      .then((x: unknown) => setList(Array.isArray(x) ? (x as AssignableUser[]) : []))
      .catch(() => setList([]));
  }, [leadId]);

  const submit = async (assignedTo: string, why?: string): Promise<void> => {
    if (!assignedTo) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/assign`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignedTo, reason: why?.trim() || undefined }),
      });
      const dj = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(dj.message ?? dj.error ?? 'Assignment failed'); return; }
      setSel(''); setReason(''); onDone();
    } catch { setErr('CRM API unreachable'); } finally { setBusy(false); }
  };

  if (list === null || list.length === 0) return null; // loading, or the caller may not assign

  // Self-claim only (a rep): a single button, no reason (first assignment / claiming).
  if (list.length === 1 && list[0].self) {
    const meId = list[0].id;
    if (currentOwner === meId) return null; // already mine
    return (
      <>
        <button disabled={busy} onClick={() => void submit(meId)} style={s.inlineBtn}>Assign to me</button>
        {err && <span style={{ color: 'var(--bad)', fontSize: 12, marginLeft: 6 }}>{err}</span>}
      </>
    );
  }

  // Manager: pick any eligible member. A reassignment (off an existing owner) requires a reason.
  const isReassign = !!currentOwner && !!sel && sel !== currentOwner;
  return (
    <>
      <select value={sel} onChange={(e) => setSel(e.target.value)} style={s.assignSelect} aria-label="Assign lead to">
        <option value="">Assign to…</option>
        {list.map((u) => <option key={u.id} value={u.id}>{u.displayName}{u.self ? ' (me)' : ''}</option>)}
      </select>
      {isReassign && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          style={s.assignReason}
        />
      )}
      <button
        disabled={busy || !sel || sel === currentOwner || (isReassign && !reason.trim())}
        onClick={() => void submit(sel, reason)}
        style={s.inlineBtn}
      >Assign</button>
      {err && <span style={{ color: 'var(--bad)', fontSize: 12, marginLeft: 6 }}>{err}</span>}
    </>
  );
}
