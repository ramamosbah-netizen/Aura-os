'use client';

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LEAD_QUALIFICATION_DIMENSIONS, LEAD_QUALIFICATION_LABELS, elvSystemLabel, type ElvSystem } from '@aura/shared';
import CreateDrawer from './ui/create-drawer';
import LeadConvertDrawer from './lead-convert-drawer';
import Timeline from './timeline';

// Lead 360 — the acquisition command center for a single lead. Everything you need
// to work and qualify it in one place: the qualification verdict (score + why),
// what it would convert into (the Account/Contact match), the ELV context of the
// job, its interaction history, and every action — qualify, assess, assign, convert.

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
const REC_COLOR: Record<string, string> = { QUALIFY: 'var(--good)', REVIEW: 'var(--warn, #d97706)', DISQUALIFY: 'var(--bad)' };
const scoreColor = (n: number): string => (n >= 70 ? 'var(--good)' : n >= 40 ? 'var(--warn, #d97706)' : 'var(--bad)');
const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
const d = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : '—');

export default function Lead360Client({ lead, qualification, accounts }: {
  lead: Lead;
  qualification: Qualification | null;
  accounts: AccountLite[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<TeamUser | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [dims, setDims] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState(lead.qualificationNotes ?? '');

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

  return (
    <div>
      {/* ── Header ── */}
      <div style={st.header}>
        <div style={{ minWidth: 0 }}>
          <h1 style={st.h1}>{lead.name}</h1>
          <div style={st.subline}>
            <span style={st.statusPill}>{STATUS_LABEL[lead.status] ?? lead.status}</span>
            {lead.companyName && <span><b style={{ color: 'var(--fg)' }}>{lead.companyName}</b></span>}
            {lead.source && <span>Source: {lead.source.replace('_', ' ')}</span>}
            <span>Captured {d(lead.createdAt)}</span>
            <span>
              Owner: {lead.assignedTo ?? <span style={{ color: 'var(--muted)' }}>Unassigned</span>}
              {me && lead.assignedTo !== me.username && !converted && (
                <button disabled={busy} onClick={() => void patch({ assignedTo: me.username }, 'Assigned to you.')} style={st.inlineBtn}>Assign to me</button>
              )}
            </span>
          </div>
        </div>
        {a && (
          <div style={st.scoreBox}>
            <div style={{ fontSize: 30, fontWeight: 800, color: scoreColor(a.score), lineHeight: 1 }}>{a.score}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Qual. score</div>
            <div style={{ ...st.recBadge, color: REC_COLOR[a.recommendation], borderColor: REC_COLOR[a.recommendation] }}>{a.recommendation}</div>
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={st.actionRow}>
        {!converted && lead.status !== 'qualified' && (
          <button disabled={busy} onClick={() => void patch({ status: 'qualified' }, 'Lead marked qualified.')} style={st.primaryBtn}>Mark qualified ✓</button>
        )}
        {!converted && <LeadConvertDrawer lead={lead} accounts={accounts} onDone={() => { setMsg('Converted to an opportunity.'); router.refresh(); }} />}
        <CreateDrawer entity="Lead" mode="edit" buttonLabel="Edit" subtitle="Update this lead's details." endpoint={`/api/crm/leads/${lead.id}`} fields={editFields}
          initialValues={{
            name: lead.name, companyName: lead.companyName ?? '', email: lead.email ?? '', phone: lead.phone ?? '',
            estimatedValue: lead.estimatedValue != null ? String(lead.estimatedValue) : '', expectedTimeline: lead.expectedTimeline ?? '',
            requirement: lead.requirement ?? '', projectName: lead.projectName ?? '', projectLocation: lead.projectLocation ?? '',
            consultant: lead.consultant ?? '', mainContractor: lead.mainContractor ?? '',
          }} />
        {!converted && lead.status !== 'disqualified' && (
          <button disabled={busy} onClick={() => void patch({ status: 'disqualified' }, 'Lead disqualified.')} style={st.ghostBtn}>Disqualify</button>
        )}
        {err && <span style={{ color: 'var(--bad)', fontSize: 13 }}>{err}</span>}
        {msg && <span style={{ color: 'var(--good)', fontSize: 13 }}>{msg}</span>}
      </div>

      {converted && (
        <a href={`/crm/opportunities/${lead.convertedOpportunityId}`} style={st.convertedBanner}>
          ✓ Converted {d(lead.convertedAt)} — open the Opportunity →
        </a>
      )}

      {/* ── Grid ── */}
      <div style={st.grid}>
        {/* Qualification */}
        <section style={{ ...st.card, gridColumn: '1 / -1' }}>
          <div style={st.cardHead}>
            <div style={st.cardTitle}>Qualification</div>
            {!converted && <button style={st.linkBtn} onClick={() => setAssessing((v) => !v)}>{assessing ? 'Cancel' : a && a.coverage.rated > 0 ? 'Update assessment' : 'Assess this lead'}</button>}
          </div>
          {!a || a.coverage.rated === 0 ? (
            !assessing && <p style={st.muted}>Not assessed yet — score the eight dimensions to get a QUALIFY / REVIEW / DISQUALIFY verdict.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <Meter value={a.score} />
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  Confidence <b style={{ color: 'var(--fg)' }}>{a.confidence}</b> · {a.coverage.rated}/{a.coverage.total} dimensions rated
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={st.subhead}>Strengths</div>
                  {a.strengths.length ? a.strengths.map((r) => <Chip key={r.key} label={r.label} value={r.value} tone="good" />) : <span style={st.muted}>None yet.</span>}
                </div>
                <div>
                  <div style={st.subhead}>Gaps — go find out</div>
                  {a.gaps.length ? a.gaps.map((r) => <Chip key={r.key} label={r.label} value={r.value} tone="bad" />) : <span style={st.muted}>None.</span>}
                </div>
              </div>
              {lead.qualificationNotes && <p style={{ ...st.muted, marginTop: 10, fontStyle: 'italic' }}>“{lead.qualificationNotes}”</p>}
            </>
          )}

          {assessing && (
            <div style={st.assessBox}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {LEAD_QUALIFICATION_DIMENSIONS.map((k) => (
                  <label key={k} style={st.dimRow}>
                    <span style={{ fontSize: 12.5 }}>{LEAD_QUALIFICATION_LABELS[k]}</span>
                    <input type="number" min={0} max={100} placeholder="0–100" value={dims[k] ?? ''}
                      onChange={(e) => setDims((p) => ({ ...p, [k]: e.target.value }))} style={st.dimInput} />
                  </label>
                ))}
              </div>
              <textarea placeholder="Reasoning behind the numbers (optional)…" value={notes} onChange={(e) => setNotes(e.target.value)} style={st.notes} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={st.ghostBtn} onClick={() => setAssessing(false)} disabled={busy}>Cancel</button>
                <button style={st.primaryBtn} onClick={() => void saveAssessment()} disabled={busy}>Save assessment</button>
              </div>
            </div>
          )}
        </section>

        {/* Contact & conversion target */}
        <section style={st.card}>
          <div style={st.cardTitle}>Contact</div>
          <Row label="Email" value={lead.email ? <a href={`mailto:${lead.email}`} style={st.link}>{lead.email}</a> : '—'} />
          <Row label="Phone" value={lead.phone ? <a href={`tel:${lead.phone}`} style={st.link}>{lead.phone}</a> : '—'} />
          <Row label="Company" value={lead.companyName ?? '—'} />
          <Row label="First response" value={lead.firstRespondedAt ? d(lead.firstRespondedAt) : <span style={{ color: 'var(--warn, #d97706)' }}>not yet</span>} />
        </section>

        {/* ELV context */}
        <section style={st.card}>
          <div style={st.cardTitle}>The Job (ELV context)</div>
          <Row label="Requirement" value={lead.requirement ?? '—'} />
          <Row label="Systems" value={lead.systems?.length ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{lead.systems.map((s) => <span key={s} style={st.tag}>{elvSystemLabel(s as ElvSystem)}</span>)}</span> : '—'} />
          <Row label="Sector" value={lead.sector ?? '—'} />
          <Row label="Project" value={lead.projectName ?? '—'} />
          <Row label="Location" value={lead.projectLocation ?? '—'} />
          <Row label="Consultant" value={lead.consultant ?? '—'} />
          <Row label="Main contractor" value={lead.mainContractor ?? '—'} />
          <Row label="Est. value" value={lead.estimatedValue != null ? `AED ${aed(lead.estimatedValue)}` : '—'} />
          <Row label="Timeline" value={lead.expectedTimeline ?? '—'} />
        </section>

        {/* Timeline */}
        <section style={{ ...st.card, gridColumn: '1 / -1' }}>
          <div style={st.cardTitle}>Timeline</div>
          <Timeline recordId={lead.id} />
        </section>
      </div>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div style={{ height: 10, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: scoreColor(value) }} />
      </div>
    </div>
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
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>{value}</span>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 },
  h1: { fontSize: 26, margin: '0 0 8px', letterSpacing: -0.5 },
  subline: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: 'var(--muted)' },
  statusPill: { border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 999, padding: '2px 11px', fontSize: 12, fontWeight: 600 },
  inlineBtn: { marginLeft: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--accent)', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' },
  scoreBox: { textAlign: 'center', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px', flexShrink: 0 },
  recBadge: { marginTop: 5, fontSize: 10.5, fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '1px 8px', letterSpacing: 0.4 },
  actionRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  primaryBtn: { border: '1px solid var(--accent)', background: 'var(--accent)', color: '#0b1020', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  ghostBtn: { border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' },
  convertedBanner: { display: 'block', border: '1px solid var(--good)', color: 'var(--good)', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--panel)' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 13, fontWeight: 700, marginBottom: 10 },
  subhead: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 6 },
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  link: { color: 'var(--accent)', textDecoration: 'none' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 },
  tag: { fontSize: 11, border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px' },
  assessBox: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 },
  dimRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dimInput: { width: 80, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', padding: '5px 8px', fontSize: 12.5, outline: 'none' },
  notes: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', padding: '8px 10px', fontSize: 13, minHeight: 54, outline: 'none', resize: 'vertical' },
};
