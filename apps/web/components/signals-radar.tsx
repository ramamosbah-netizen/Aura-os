'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

// Signals Radar — the acquisition triage board, redesigned as a visual command surface.
// Every signal is a CARD that answers at a glance: what is it (scope), where did it come
// from (source), how strong is it (scoring ring) and what should I do (AI read). Clicking
// a card opens the full summary drawer; Promote / Advance / Dismiss act inline.

interface RadarSignal {
  id: string;
  title: string;
  source: string;
  type: string;
  status: string;
  accountId: string | null;
  accountName: string | null;
  confidence: number;
  detectedAt: string;
  ownerId: string | null;
  evidence: string | null;
  description?: string | null;
  contextType?: string | null;
  contextId?: string | null;
}
interface Tally { key: string; count: number }
export interface RadarData {
  counts: { open: number; new: number; reviewing: number; researching: number; promoted: number; dismissed: number };
  bySource: Tally[];
  byType: Tally[];
  signals: RadarSignal[];
}

const SOURCES = ['MANUAL', 'INBOUND', 'REFERRAL', 'MARKET', 'RELATIONSHIP', 'ACCOUNT_GROWTH', 'TENDER_DISCOVERY', 'INTELLIGENCE'];
const TYPES = ['NEW_PROJECT', 'RFQ_RECEIVED', 'TENDER_DETECTED', 'RENEWAL_DUE', 'CROSS_SELL', 'UPSELL', 'EXPANSION', 'REFERRAL', 'MARKET_EVENT', 'OTHER'];
const SYSTEM_SOURCES = new Set(['ACCOUNT_GROWTH', 'TENDER_DISCOVERY', 'INTELLIGENCE']);
const TIMEBOUND_TYPES = new Set(['RENEWAL_DUE', 'RFQ_RECEIVED', 'TENDER_DETECTED']);

const TYPE_ICON: Record<string, string> = {
  NEW_PROJECT: '🏗', RFQ_RECEIVED: '📨', TENDER_DETECTED: '📋', RENEWAL_DUE: '♻',
  CROSS_SELL: '⇄', UPSELL: '↗', EXPANSION: '⬈', REFERRAL: '🤝', MARKET_EVENT: '📈', OTHER: '•',
};
const label = (s: string): string => s.toLowerCase().replace(/_/g, ' ');
const daysSince = (iso: string): number => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

const band = (c: number): { name: string; color: string } =>
  c >= 70 ? { name: 'Strong', color: 'var(--good)' }
    : c >= 40 ? { name: 'Moderate', color: 'var(--warn, #d97706)' }
      : { name: 'Weak', color: 'var(--bad)' };

// ── AI read — heuristic composition over the signal's own facts (source reliability,
// confidence band, account linkage, urgency of the type, freshness). Pure & explainable.
interface AiRead { verdict: 'PROMOTE' | 'INVESTIGATE' | 'VERIFY'; tone: string; reasons: string[]; action: string }
function analyzeSignal(s: RadarSignal): AiRead {
  const reasons: string[] = [];
  const age = daysSince(s.detectedAt);
  const b = band(s.confidence);

  if (SYSTEM_SOURCES.has(s.source)) reasons.push(`System-detected via ${label(s.source)} — deterministic evidence, low noise.`);
  else if (s.source === 'REFERRAL' || s.source === 'RELATIONSHIP') reasons.push('Came through a relationship — warm by nature.');
  else reasons.push(`${label(s.source)} signal — needs human validation.`);

  if (s.accountName) reasons.push(`Known account (${s.accountName}) — existing relationship shortens the path.`);
  else reasons.push('No account linked yet — identify the party first.');

  if (TIMEBOUND_TYPES.has(s.type)) reasons.push(`${label(s.type)} is time-bound — value decays if not acted on.`);
  if (age > 21) reasons.push(`Detected ${age}d ago and still open — act now or dismiss.`);
  else if (age <= 7) reasons.push('Fresh — detected this week.');

  if (!s.evidence && !s.description) reasons.push('No evidence captured — record why this is real.');

  if (s.confidence >= 70) {
    return { verdict: 'PROMOTE', tone: 'var(--good)', reasons, action: `${b.name} ${s.confidence}% confidence — promote to a lead and assign an owner.` };
  }
  if (s.confidence >= 40) {
    return { verdict: 'INVESTIGATE', tone: 'var(--warn, #d97706)', reasons, action: `${b.name} ${s.confidence}% confidence — advance to research and firm up the evidence.` };
  }
  return { verdict: 'VERIFY', tone: 'var(--bad)', reasons, action: `${b.name} ${s.confidence}% confidence — verify it is real or dismiss to keep the radar clean.` };
}

const contextHref = (t: string | null | undefined, id: string | null | undefined): string | null => {
  if (!t || !id) return null;
  const map: Record<string, string> = {
    project: `/projects/projects/${id}`, contract: `/contracts/contracts/${id}`,
    tender: `/tendering/tenders/${id}`, opportunity: `/crm/opportunities/${id}`,
  };
  return map[t.toLowerCase()] ?? null;
};

// ── Confidence ring (SVG donut) ────────────────────────────────────────────────
function ConfidenceRing({ value, size = 52 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const col = band(value).color;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={5}
        strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        style={{ fontSize: 13, fontWeight: 800, fill: col }}>{value}</text>
    </svg>
  );
}

// ── Triage funnel strip ─────────────────────────────────────────────────────────
function FunnelStrip({ counts }: { counts: RadarData['counts'] }) {
  const steps = [
    { label: 'New', n: counts.new, color: 'var(--accent)' },
    { label: 'Reviewing', n: counts.reviewing, color: 'var(--warn, #d97706)' },
    { label: 'Researching', n: counts.researching, color: 'var(--warn, #d97706)' },
    { label: 'Promoted', n: counts.promoted, color: 'var(--good)' },
    { label: 'Dismissed', n: counts.dismissed, color: 'var(--muted)' },
  ];
  return (
    <div style={st.funnel}>
      {steps.map((s, i) => (
        <div key={s.label} style={st.funnelStep}>
          <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.n}</div>
          <div style={st.funnelLabel}>{s.label}</div>
          {i < steps.length - 1 && <span style={st.funnelArrow}>→</span>}
        </div>
      ))}
    </div>
  );
}

function TallyBars({ title, rows, total }: { title: string; rows: Tally[]; total: number }) {
  return (
    <div style={st.tallyBox}>
      <div style={st.tallyTitle}>{title}</div>
      {rows.slice(0, 5).map((r) => (
        <div key={r.key} style={st.tallyRow}>
          <span style={st.tallyKey}>{label(r.key)}</span>
          <span style={st.tallyTrack}><span style={{ ...st.tallyFill, width: `${total ? (r.count / total) * 100 : 0}%` }} /></span>
          <span style={st.tallyN}>{r.count}</span>
        </div>
      ))}
      {rows.length === 0 && <div style={st.tallyEmpty}>—</div>}
    </div>
  );
}

// ── The board ────────────────────────────────────────────────────────────────────
export default function SignalsRadar({ data }: { data: RadarData | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', source: 'MANUAL', type: 'NEW_PROJECT', accountName: '', confidence: 50, evidence: '' });

  const counts = data?.counts ?? { open: 0, new: 0, reviewing: 0, researching: 0, promoted: 0, dismissed: 0 };
  const signals = data?.signals ?? [];
  const selected = useMemo(() => signals.find((s) => s.id === openId) ?? null, [signals, openId]);

  const call = async (id: string, path: string, method: string, body?: unknown): Promise<void> => {
    setBusy(id); setErr(null);
    try {
      const res = await fetch(`/api/crm/signals/${id}/${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || d.error || 'Action failed'); }
      setOpenId(null);
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const promote = (id: string) => call(id, 'promote', 'POST');
  const advance = (id: string, to: 'REVIEWING' | 'RESEARCHING') => call(id, 'advance', 'PATCH', { to });
  const dismiss = (id: string) => call(id, 'dismiss', 'POST', { reason: 'not pursuing' });

  const addSignal = async (): Promise<void> => {
    if (!form.title.trim()) return;
    setBusy('new'); setErr(null);
    try {
      const res = await fetch('/api/crm/signals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          confidence: Number(form.confidence),
          accountName: form.accountName || undefined,
          evidence: form.evidence || undefined,
        }),
      });
      if (!res.ok) throw new Error('Could not create the signal');
      setForm({ title: '', source: 'MANUAL', type: 'NEW_PROJECT', accountName: '', confidence: 50, evidence: '' });
      setAdding(false);
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div>
      {/* ── Radar summary strip ── */}
      <div style={st.summary}>
        <FunnelStrip counts={counts} />
        <TallyBars title="By source" rows={data?.bySource ?? []} total={counts.open} />
        <TallyBars title="By type" rows={data?.byType ?? []} total={counts.open} />
        <button style={st.addBtn} onClick={() => setAdding((v) => !v)}>{adding ? '✕ Cancel' : '+ Detect signal'}</button>
      </div>

      {err && <div style={st.err}>{err}</div>}

      {adding && (
        <div style={st.form}>
          <input style={{ ...st.input, flex: '1 1 260px' }} placeholder="What happened? (signal title)" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input style={{ ...st.input, flex: '0 1 180px' }} placeholder="Account (optional)" value={form.accountName}
            onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
          <select style={st.input} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <select style={st.input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_ICON[t]} {label(t)}</option>)}
          </select>
          <label style={st.slider}>
            confidence <b style={{ color: band(form.confidence).color }}>{form.confidence}</b>
            <input type="range" min={0} max={100} value={form.confidence}
              onChange={(e) => setForm({ ...form, confidence: Number(e.target.value) })} />
          </label>
          <input style={{ ...st.input, flex: '1 1 100%' }} placeholder="Evidence — why is this real? (optional)" value={form.evidence}
            onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
          <button style={st.primaryBtn} disabled={busy === 'new'} onClick={() => void addSignal()}>Detect ⚡</button>
        </div>
      )}

      {/* ── Cards ── */}
      {data === null ? (
        <p style={st.empty}>Radar unavailable.</p>
      ) : signals.length === 0 ? (
        <p style={st.empty}>No open signals — the radar is clear. New business events (renewals due, expansions, tenders detected) land here automatically.</p>
      ) : (
        <div style={st.grid}>
          {signals.map((s) => {
            const ai = analyzeSignal(s);
            const age = daysSince(s.detectedAt);
            return (
              <div key={s.id} style={{ ...st.card, ...(openId === s.id ? st.cardOpen : {}) }}
                onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                <div style={st.cardTop}>
                  <ConfidenceRing value={s.confidence} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={st.cardTitle}>{TYPE_ICON[s.type] ?? '•'} {s.title}</div>
                    <div style={st.chips}>
                      {s.accountName && (
                        s.accountId
                          ? <a href={`/crm/accounts/${s.accountId}`} style={st.accountChip} onClick={(e) => e.stopPropagation()}>{s.accountName}</a>
                          : <span style={st.accountChip}>{s.accountName}</span>
                      )}
                      <span style={st.chip}>{label(s.source)}</span>
                      <span style={st.chip}>{label(s.type)}</span>
                      <span style={{ ...st.chip, color: 'var(--muted)' }}>{label(s.status)} · {age}d</span>
                    </div>
                  </div>
                </div>

                {(s.evidence || s.description) && <div style={st.evidence}>{s.evidence ?? s.description}</div>}

                <div style={{ ...st.aiBox, borderLeftColor: ai.tone }}>
                  <span style={{ ...st.verdict, color: ai.tone, borderColor: ai.tone }}>{ai.verdict}</span>
                  <span style={st.aiText}>{ai.action}</span>
                </div>

                <div style={st.cardActions} onClick={(e) => e.stopPropagation()}>
                  <button style={st.primaryBtn} disabled={busy === s.id} onClick={() => void promote(s.id)}>Promote → Lead</button>
                  {s.status === 'NEW' && (
                    <button style={st.ghostBtn} disabled={busy === s.id} onClick={() => void advance(s.id, 'REVIEWING')}>Review</button>
                  )}
                  {(s.status === 'NEW' || s.status === 'REVIEWING') && (
                    <button style={st.ghostBtn} disabled={busy === s.id} onClick={() => void advance(s.id, 'RESEARCHING')}>Research</button>
                  )}
                  <span style={{ flex: 1 }} />
                  <button style={st.linkBtn} disabled={busy === s.id} onClick={() => void dismiss(s.id)}>Dismiss</button>
                </div>

                {/* ── Expanded summary (the drawer, inline) ── */}
                {openId === s.id && (
                  <div style={st.detail} onClick={(e) => e.stopPropagation()}>
                    <DetailSection title="Scope">
                      <p style={st.detailText}>{s.description ?? s.title}</p>
                      {s.evidence && <p style={{ ...st.detailText, color: 'var(--muted)' }}>Evidence: {s.evidence}</p>}
                      {contextHref(s.contextType, s.contextId) && (
                        <a href={contextHref(s.contextType, s.contextId)!} style={st.ctxLink}>Origin: {s.contextType} record →</a>
                      )}
                    </DetailSection>
                    <DetailSection title="Source & lineage">
                      <p style={st.detailText}>
                        {SYSTEM_SOURCES.has(s.source)
                          ? `Emitted automatically by the ${label(s.source)} reactor`
                          : `Captured from ${label(s.source)}`}
                        {' '}on {new Date(s.detectedAt).toLocaleDateString()} · owner {s.ownerId ?? 'unassigned'}
                      </p>
                    </DetailSection>
                    <DetailSection title="Scoring">
                      <div style={st.scoreLine}>
                        <span style={st.scoreTrack}><span style={{ ...st.scoreFill, width: `${s.confidence}%`, background: band(s.confidence).color }} /></span>
                        <b style={{ color: band(s.confidence).color, fontSize: 12.5 }}>{s.confidence} · {band(s.confidence).name}</b>
                      </div>
                      <p style={{ ...st.detailText, color: 'var(--muted)' }}>0–100 confidence the signal is worth pursuing; ≥70 promotes cleanly, 40–69 needs research, &lt;40 needs verification.</p>
                    </DetailSection>
                    <DetailSection title="AI analysis">
                      {ai.reasons.map((r, i) => <p key={i} style={{ ...st.detailText, margin: '0 0 4px' }}>· {r}</p>)}
                    </DetailSection>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={st.detailTitle}>{title}</div>
      {children}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  summary: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 16 },
  funnel: { display: 'flex', gap: 4, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: '10px 16px', flex: '1 1 320px' },
  funnelStep: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  funnelLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' },
  funnelArrow: { color: 'var(--border)', fontSize: 14 },
  tallyBox: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: '10px 14px', flex: '1 1 220px', minWidth: 200 },
  tallyTitle: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 7 },
  tallyRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  tallyKey: { fontSize: 11.5, width: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'capitalize' },
  tallyTrack: { flex: 1, height: 5, borderRadius: 4, background: 'var(--panel-2)', overflow: 'hidden' },
  tallyFill: { display: 'block', height: '100%', borderRadius: 4, background: 'var(--accent)' },
  tallyN: { fontSize: 11.5, fontWeight: 700, minWidth: 16, textAlign: 'right' },
  tallyEmpty: { color: 'var(--muted)', fontSize: 12 },
  addBtn: { alignSelf: 'center', fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', whiteSpace: 'nowrap' },
  err: { border: '1px solid var(--bad)', color: 'var(--bad)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 12 },
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', border: '1px dashed var(--border)', borderRadius: 12, padding: 12, marginBottom: 16, background: 'var(--panel)' },
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12.5 },
  slider: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' },
  primaryBtn: { fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#0b1020', cursor: 'pointer' },
  ghostBtn: { fontSize: 12.5, padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer' },
  linkBtn: { fontSize: 12, padding: '4px 6px', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' },
  empty: { color: 'var(--muted)', fontSize: 13.5, border: '1px dashed var(--border)', borderRadius: 12, padding: '22px 18px', textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, alignItems: 'start' },
  card: { borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 14, background: 'var(--panel)', padding: 14, cursor: 'pointer' },
  cardOpen: { borderColor: 'var(--accent)', gridColumn: '1 / -1' },
  cardTop: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  cardTitle: { fontSize: 14.5, fontWeight: 700, lineHeight: 1.35 },
  chips: { display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 },
  accountChip: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--accent)', color: 'var(--accent)', textDecoration: 'none' },
  chip: { fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--fg)', textTransform: 'capitalize' },
  evidence: { fontSize: 12.5, color: 'var(--muted)', margin: '10px 2px 0', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  aiBox: { display: 'flex', gap: 8, alignItems: 'flex-start', borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: 'var(--accent)', background: 'var(--panel-2)', borderRadius: '0 8px 8px 0', padding: '7px 10px', marginTop: 10 },
  verdict: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '1px 8px', flexShrink: 0, marginTop: 1 },
  aiText: { fontSize: 12, lineHeight: 1.45 },
  cardActions: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 12 },
  detail: { borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, cursor: 'default', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 },
  detailTitle: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--accent)', fontWeight: 800, marginBottom: 5 },
  detailText: { fontSize: 12.5, margin: '0 0 6px', lineHeight: 1.5 },
  ctxLink: { fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 },
  scoreLine: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  scoreTrack: { flex: 1, height: 7, borderRadius: 5, background: 'var(--panel-2)', overflow: 'hidden' },
  scoreFill: { display: 'block', height: '100%', borderRadius: 5 },
};
