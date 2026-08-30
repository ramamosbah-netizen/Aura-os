'use client';

import { useState, useTransition, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SIGNAL_DISMISS_REASON_CODES, SIGNAL_SOURCES, SIGNAL_TYPES, SIGNAL_STATUSES } from '@aura/shared';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import SaveViewButton from './save-view-button';

// Signals Radar — one server-backed acquisition dataset with Cards/List presentation modes.
// Cards answer at a glance what/where/how strong; List supports operational scanning. Both
// use the same URL query, permissions and lifecycle actions.

interface RadarSignal {
  id: string;
  title: string;
  source: string;
  type: string;
  status: string;
  accountId: string | null;
  accountName: string | null;
  contactId?: string | null;
  confidence: number;
  detectedAt: string;
  ownerId: string | null;
  evidence: string | null;
  description?: string | null;
  contextType?: string | null;
  contextId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  dismissalReasonCode?: string | null;
  dismissalNote?: string | null;
  promotedLeadId?: string | null;
}
interface Tally { key: string; count: number }
export interface RadarData {
  counts: { open: number; new: number; reviewing: number; researching: number; promoted: number; dismissed: number };
  bySource: Tally[];
  byType: Tally[];
  signals: RadarSignal[];
  page?: { items: RadarSignal[]; total: number; limit: number; offset: number; hasMore: boolean };
  summary?: { total: number; open: number; new: number; reviewing: number; researching: number; promoted: number; dismissed: number; highPotential: number; bySource: Tally[]; byType: Tally[] };
}
interface RadarOwner { username: string; roleLabel: string; }

const SOURCES = [...SIGNAL_SOURCES];
const TYPES = [...SIGNAL_TYPES];
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
    : c >= 40 ? { name: 'Moderate', color: 'var(--warn, var(--warn))' }
      : { name: 'Weak', color: 'var(--bad)' };

// ── Advisory read — heuristic composition over the signal's own facts (source reliability,
// confidence band, account linkage, urgency of the type, freshness). Pure & explainable.
interface AdvisoryRead { verdict: 'PROMOTE' | 'INVESTIGATE' | 'VERIFY'; tone: string; reasons: string[]; action: string }
function analyzeSignal(s: RadarSignal): AdvisoryRead {
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
    return { verdict: 'INVESTIGATE', tone: 'var(--warn, var(--warn))', reasons, action: `${b.name} ${s.confidence}% confidence — advance to research and firm up the evidence.` };
  }
  return { verdict: 'VERIFY', tone: 'var(--bad)', reasons, action: `${b.name} ${s.confidence}% confidence — verify it is real or dismiss to keep the radar clean.` };
}

const contextHref = (t: string | null | undefined, id: string | null | undefined): string | null => {
  if (!t || !id) return null;
  const map: Record<string, string> = {
    account: `/crm/accounts/${id}`, contact: `/crm/contacts/${id}`, lead: `/crm/leads/${id}`, quotation: `/crm/quotations/${id}`,
    project: `/project/${id}`, contract: `/contracts/contracts/${id}`,
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
    { label: 'Reviewing', n: counts.reviewing, color: 'var(--warn, var(--warn))' },
    { label: 'Researching', n: counts.researching, color: 'var(--warn, var(--warn))' },
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
export default function SignalsRadar({ data, owners = [], initialQuery = {} }: { data: RadarData | null; owners?: RadarOwner[]; initialQuery?: Record<string, string> }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', source: 'MANUAL', type: 'NEW_PROJECT', accountName: '', confidence: 50, evidence: '', ownerId: '' });
  const [promoteId, setPromoteId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ lead: { name: string; companyName: string | null; source: string | null; assignedTo: string | null; accountId: string | null; requirement: string | null }; matches: Array<{ kind: string; id: string; label: string; exact: boolean }> } | null>(null);
  const [createdLead, setCreatedLead] = useState<{ id: string; name: string } | null>(null);
  const [dismissForm, setDismissForm] = useState<{ id: string; duplicate: boolean } | null>(null);
  const [dismissReason, setDismissReason] = useState('NOT_RELEVANT');
  const [dismissNote, setDismissNote] = useState('');

  const queryValue = (key: string): string => params.get(key) ?? initialQuery[key] ?? '';
  const search = queryValue('search');
  const sourceFilter = queryValue('source');
  const typeFilter = queryValue('type');
  const statusFilter = queryValue('status');
  const ownerFilter = queryValue('ownerId');
  const accountFilter = queryValue('accountId');
  const detectedFrom = queryValue('detectedFrom');
  const detectedTo = queryValue('detectedTo');
  const confidenceMin = queryValue('confidenceMin');
  const confidenceMax = queryValue('confidenceMax');
  const sort = queryValue('sort');
  const view = queryValue('view') === 'list' ? 'list' : 'cards';
  const ownerLabel = (ownerId: string | null | undefined): string => {
    if (!ownerId) return 'Unassigned';
    const owner = owners.find((candidate) => candidate.username === ownerId);
    return owner ? owner.username.replace(/^u-/, '').replace(/[-_.]+/g, ' ') : ownerId;
  };
  const counts = data?.summary ? { open: data.summary.open, new: data.summary.new, reviewing: data.summary.reviewing, researching: data.summary.researching, promoted: data.summary.promoted, dismissed: data.summary.dismissed } : (data?.counts ?? { open: 0, new: 0, reviewing: 0, researching: 0, promoted: 0, dismissed: 0 });
  const signals = data?.page?.items ?? data?.signals ?? [];
  const total = data?.page?.total ?? signals.length;
  const offset = data?.page?.offset ?? Number(queryValue('offset') || 0);
  const limit = data?.page?.limit ?? Number(queryValue('limit') || 50);
  const hasMore = data?.page?.hasMore ?? false;
  const hasFilters = Boolean(search || sourceFilter || typeFilter || statusFilter || ownerFilter || accountFilter || detectedFrom || detectedTo || confidenceMin || confidenceMax);
  const updateQuery = (updates: Record<string, string | undefined>): void => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) { if (value) next.set(key, value); else next.delete(key); }
    if (Object.keys(updates).some((key) => ['search', 'source', 'type', 'status', 'ownerId', 'accountId', 'detectedFrom', 'detectedTo', 'confidenceMin', 'confidenceMax', 'sort'].includes(key))) next.delete('offset');
    startTransition(() => router.push(`/crm/radar${next.toString() ? `?${next.toString()}` : ''}`));
  };
  const responseError = async (res: Response, fallback: string): Promise<Error> => {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
    const detail = body.message || body.error;
    if (res.status === 401) return new Error('Authentication required. Please sign in again.');
    if (res.status === 403) return new Error('Access denied. You do not have permission for this action.');
    if (res.status === 404) return new Error('Signal not found or no longer available.');
    if (res.status === 409) return new Error(detail ? `Conflict: ${detail}` : 'Conflict: this signal changed. Refresh and try again.');
    if (res.status === 422 || res.status === 400) return new Error(detail ? `Validation failed: ${detail}` : 'Validation failed. Check the signal details and try again.');
    if (res.status >= 500 || res.status === 0) return new Error('Service temporarily unavailable. Retry in a moment.');
    return new Error(detail || fallback);
  };
  const call = async (id: string, path: string, method: string, body?: unknown): Promise<boolean> => {
    setBusy(id); setErr(null);
    try {
      const res = await fetch(`/api/crm/signals/${id}/${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw await responseError(res, 'Action failed.');
      setOpenId(null);
      router.refresh();
      return true;
    } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(null); }
  };
  const reviewPromotion = async (id: string): Promise<void> => {
    setPromoteId(id); setPreview(null); setErr(null);
    try {
      const res = await fetch(`/api/crm/signals/${id}/promotion-preview`, { cache: 'no-store' });
      if (!res.ok) throw await responseError(res, 'Could not prepare Lead review.');
      const body = await res.json().catch(() => ({}));
      setPreview(body);
    } catch (e) { setErr((e as Error).message); setPromoteId(null); }
  };
  const promote = async (id: string): Promise<void> => {
    setBusy(id); setErr(null);
    try {
      const res = await fetch(`/api/crm/signals/${id}/promote`, { method: 'POST', headers: { 'content-type': 'application/json' } });
      if (!res.ok) throw await responseError(res, 'Lead promotion failed.');
      const body = await res.json().catch(() => ({}));
      if (body.lead) setCreatedLead({ id: body.lead.id, name: body.lead.name });
      setPromoteId(null); setPreview(null); setOpenId(null); router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const advance = (id: string, to: 'REVIEWING' | 'RESEARCHING') => call(id, 'advance', 'PATCH', { to });
  const requestDismiss = (id: string, asDuplicate = false): void => {
    setDismissForm({ id, duplicate: asDuplicate });
    setDismissReason(asDuplicate ? 'DUPLICATE' : 'NOT_RELEVANT');
    setDismissNote(asDuplicate ? 'Matched an existing business record' : '');
    setErr(null);
  };
  // Keep the action call-sites shared between Cards and List; the actual mutation is confirmed below.
  const dismiss = (id: string, asDuplicate = false): void => requestDismiss(id, asDuplicate);
  const confirmDismiss = async (): Promise<void> => {
    if (!dismissForm) return;
    const ok = await call(dismissForm.id, 'dismiss', 'POST', {
      reasonCode: dismissForm.duplicate ? 'DUPLICATE' : dismissReason,
      note: dismissNote.trim() || undefined,
      asDuplicate: dismissForm.duplicate,
    });
    if (ok) { setDismissForm(null); setDismissNote(''); }
  };

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
          ownerId: form.ownerId || undefined,
          evidence: form.evidence || undefined,
        }),
      });
      if (!res.ok) throw await responseError(res, 'Could not create the signal.');
      setForm({ title: '', source: 'MANUAL', type: 'NEW_PROJECT', accountName: '', confidence: 50, evidence: '', ownerId: '' });
      setAdding(false);
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div>
      {/* ── Radar summary strip ── */}
      <div style={st.summary}>
        <FunnelStrip counts={counts} />
        <TallyBars title="By source" rows={data?.summary?.bySource ?? data?.bySource ?? []} total={data?.summary?.total ?? counts.open} />
        <TallyBars title="By type" rows={data?.summary?.byType ?? data?.byType ?? []} total={data?.summary?.total ?? counts.open} />
        <button style={st.addBtn} onClick={() => setAdding((v) => !v)}>{adding ? '✕ Cancel' : '+ Detect signal'}</button>
      </div>

      {err && <div style={st.err}>{err}</div>}
      {createdLead && <div style={st.success}>Lead created: <a href={`/crm/leads/${createdLead.id}`} style={st.ctxLink}>{createdLead.name}</a> · <a href={`/crm/leads/${createdLead.id}`} style={st.ctxLink}>Open Lead →</a></div>}

      {dismissForm && (
        <div style={st.dismissBox} role="dialog" aria-label={dismissForm.duplicate ? 'Mark signal as duplicate' : 'Dismiss signal'}>
          <div style={st.detailTitle}>{dismissForm.duplicate ? 'Mark as duplicate' : 'Dismiss signal'}</div>
          <div style={st.dismissFields}>
            <label style={st.fieldLabel}>Reason
              <select style={st.input} value={dismissReason} disabled={dismissForm.duplicate} onChange={(e) => setDismissReason(e.target.value)}>
                {SIGNAL_DISMISS_REASON_CODES.filter((reason) => reason !== 'DUPLICATE').map((reason) => <option key={reason} value={reason}>{label(reason)}</option>)}
              </select>
            </label>
            <label style={{ ...st.fieldLabel, flex: '1 1 260px' }}>Note (optional)
              <input style={{ ...st.input, width: '100%' }} value={dismissNote} onChange={(e) => setDismissNote(e.target.value)} placeholder="Add context for the decision" />
            </label>
          </div>
          <div style={st.cardActions}><button type="button" style={st.primaryBtn} disabled={busy === dismissForm.id} onClick={() => void confirmDismiss()}>{dismissForm.duplicate ? 'Confirm duplicate' : 'Confirm dismiss'}</button><button type="button" style={st.linkBtn} onClick={() => setDismissForm(null)}>Cancel</button></div>
        </div>
      )}

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
          <select style={st.input} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} aria-label="Assign signal owner">
            <option value="">Unassigned</option>{owners.map((owner) => <option key={owner.username} value={owner.username}>{ownerLabel(owner.username)}</option>)}
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

      <div style={st.filters} data-testid="radar-filters">
        <input style={{ ...st.input, flex: '1 1 260px' }} value={search} onChange={(e) => updateQuery({ search: e.target.value })} placeholder="Search signals, accounts or evidence…" aria-label="Search radar" />
        <select style={st.input} value={sourceFilter} onChange={(e) => updateQuery({ source: e.target.value })} aria-label="Filter radar by source">
          <option value="">All sources</option>{SOURCES.map((source) => <option key={source} value={source}>{label(source)}</option>)}
        </select>
        <select style={st.input} value={typeFilter} onChange={(e) => updateQuery({ type: e.target.value })} aria-label="Filter radar by type">
          <option value="">All signal types</option>{TYPES.map((type) => <option key={type} value={type}>{TYPE_ICON[type] ?? '•'} {label(type)}</option>)}
        </select>
        <select style={st.input} value={statusFilter} onChange={(e) => updateQuery({ status: e.target.value })} aria-label="Filter radar by status">
          <option value="">All statuses (open by default)</option>{SIGNAL_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
        </select>
        <select style={{ ...st.input, width: 170 }} value={ownerFilter} onChange={(e) => updateQuery({ ownerId: e.target.value })} aria-label="Filter radar by owner">
          <option value="">All owners</option>
          {owners.map((owner) => <option key={owner.username} value={owner.username}>{ownerLabel(owner.username)} · {owner.roleLabel}</option>)}
          {ownerFilter && !owners.some((owner) => owner.username === ownerFilter) ? <option value={ownerFilter}>{ownerFilter}</option> : null}
        </select>
        <input style={{ ...st.input, width: 125 }} value={accountFilter} onChange={(e) => updateQuery({ accountId: e.target.value })} placeholder="Account ID" aria-label="Filter radar by account" />
        <input style={st.input} type="date" value={detectedFrom} onChange={(e) => updateQuery({ detectedFrom: e.target.value })} aria-label="Signals detected from" />
        <input style={st.input} type="date" value={detectedTo} onChange={(e) => updateQuery({ detectedTo: e.target.value })} aria-label="Signals detected to" />
        <input style={{ ...st.input, width: 72 }} type="number" min={0} max={100} value={confidenceMin} onChange={(e) => updateQuery({ confidenceMin: e.target.value })} placeholder="Min %" aria-label="Minimum confidence" />
        <input style={{ ...st.input, width: 72 }} type="number" min={0} max={100} value={confidenceMax} onChange={(e) => updateQuery({ confidenceMax: e.target.value })} placeholder="Max %" aria-label="Maximum confidence" />
        <select style={st.input} value={sort} onChange={(e) => updateQuery({ sort: e.target.value })} aria-label="Sort radar"><option value="">Newest</option><option value="confidence">Confidence</option><option value="title">Title</option></select>
        <select style={st.input} value={view} onChange={(e) => updateQuery({ view: e.target.value })} aria-label="Radar display mode"><option value="cards">Cards</option><option value="list">List</option></select>
        {(search || sourceFilter || typeFilter || statusFilter || ownerFilter || accountFilter || detectedFrom || detectedTo || confidenceMin || confidenceMax || sort) && <button type="button" style={st.linkBtn} onClick={() => updateQuery({ search: undefined, source: undefined, type: undefined, status: undefined, ownerId: undefined, accountId: undefined, detectedFrom: undefined, detectedTo: undefined, confidenceMin: undefined, confidenceMax: undefined, sort: undefined, offset: undefined })}>Clear filters</button>}
        <button type="button" style={st.ghostBtn} onClick={() => { const qs = new URLSearchParams(params.toString()); qs.delete('offset'); window.location.href = `/api/crm/signals/radar/export${qs.toString() ? `?${qs}` : ''}`; }}>Export CSV</button>
        <SaveViewButton excludeParams={['offset', 'limit']} />
        <span style={st.filterCount}>{total} {statusFilter ? label(statusFilter) : 'open'} signals · page {total ? Math.floor(offset / limit) + 1 : 0}</span>
      </div>

      {/* ── Cards ── */}
      {data === null ? (
        <p style={st.empty}>Radar unavailable.</p>
      ) : signals.length === 0 ? (
        <p style={st.empty}>{hasFilters ? 'No signals match these filters. Clear or adjust the filters to continue.' : 'No open signals — the radar is clear. New business events (renewals due, expansions, tenders detected) land here automatically.'}</p>
      ) : (
        <>
        {view === 'list' ? <div style={st.tableWrap}><table style={st.table}><thead><tr><th style={st.th}>Signal</th><th style={st.th}>Account</th><th style={st.th}>Type</th><th style={st.th}>Source</th><th style={st.th}>Status</th><th style={st.th}>Confidence</th><th style={st.th}>Detected</th><th style={st.th}>Actions</th></tr></thead><tbody>{signals.map((s) => <tr key={s.id} onClick={() => setOpenId(openId === s.id ? null : s.id)} style={{ cursor: 'pointer' }}><td style={st.td}><b>{TYPE_ICON[s.type] ?? '•'} {s.title}</b></td><td style={st.td}>{s.accountName ?? '—'}</td><td style={st.td}>{label(s.type)}</td><td style={st.td}>{label(s.source)}</td><td style={st.td}>{label(s.status)}</td><td style={st.td}><span style={{ color: band(s.confidence).color, fontWeight: 700 }}>{s.confidence}</span></td><td style={st.td}>{new Date(s.detectedAt).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE })}</td><td style={st.td} onClick={(e) => e.stopPropagation()}><button style={st.linkBtn} onClick={() => void reviewPromotion(s.id)}>Lead</button>{s.status === 'NEW' && <button style={st.linkBtn} onClick={() => void advance(s.id, 'REVIEWING')}>Review</button>}{s.status === 'REVIEWING' && <button style={st.linkBtn} onClick={() => void advance(s.id, 'RESEARCHING')}>Research</button>}<button style={st.linkBtn} onClick={() => void dismiss(s.id)}>Dismiss</button></td></tr>)}</tbody></table></div> : <div style={st.grid}>{signals.map((s) => {
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
                  <button style={st.primaryBtn} disabled={busy === s.id} onClick={() => void reviewPromotion(s.id)}>Review Lead →</button>
                  {s.status === 'NEW' && (
                    <button style={st.ghostBtn} disabled={busy === s.id} onClick={() => void advance(s.id, 'REVIEWING')}>Review</button>
                  )}
                  {s.status === 'REVIEWING' && (
                    <button style={st.ghostBtn} disabled={busy === s.id} onClick={() => void advance(s.id, 'RESEARCHING')}>Research</button>
                  )}
                  <span style={{ flex: 1 }} />
                  <button style={st.linkBtn} disabled={busy === s.id} onClick={() => void dismiss(s.id)}>Dismiss</button>
                  <button style={st.linkBtn} disabled={busy === s.id} onClick={() => void dismiss(s.id, true)}>Duplicate</button>
                </div>

                {promoteId === s.id && (
                  <div style={st.reviewBox} onClick={(e) => e.stopPropagation()}>
                    <div style={st.detailTitle}>Review Lead before creation</div>
                    {preview ? <>
                      <p style={st.detailText}><b>{preview.lead.name}</b>{preview.lead.companyName ? ` · ${preview.lead.companyName}` : ''}</p>
                      <p style={st.detailText}>Source: {preview.lead.source ?? '—'} · Owner: {preview.lead.assignedTo ?? 'Unassigned'}</p>
                      {preview.lead.requirement && <p style={{ ...st.detailText, color: 'var(--muted)' }}>Requirement: {preview.lead.requirement}</p>}
                      {preview.matches.length > 0 && <p style={{ ...st.detailText, color: 'var(--warn, var(--warn))' }}>Possible matches found: {preview.matches.map((m) => `${m.kind} · ${m.label}`).join(', ')}. Review before confirming.</p>}
                      <div style={st.cardActions}><button style={st.primaryBtn} disabled={busy === s.id} onClick={() => void promote(s.id)}>Confirm & create Lead</button><button style={st.linkBtn} onClick={() => { setPromoteId(null); setPreview(null); }}>Cancel</button></div>
                    </> : <p style={st.detailText}>Preparing a validated Lead preview…</p>}
                  </div>
                )}

                {/* ── Expanded summary (the drawer, inline) ── */}
                {openId === s.id && (
                  <div style={st.detail} onClick={(e) => e.stopPropagation()}>
                    <DetailSection title="Scope">
                      <p style={st.detailText}>{s.description ?? s.title}</p>
                      {s.evidence && <p style={{ ...st.detailText, color: 'var(--muted)' }}>Evidence: {s.evidence}</p>}
                      {s.accountId && <a href={`/crm/accounts/${s.accountId}`} style={st.ctxLink}>Account 360: {s.accountName ?? s.accountId} →</a>}
                      {s.contactId && <a href={`/crm/contacts/${s.contactId}`} style={st.ctxLink}>Contact 360: {s.contactId} →</a>}
                      {contextHref(s.contextType, s.contextId) && (
                        <a href={contextHref(s.contextType, s.contextId)!} style={st.ctxLink}>Origin: {s.contextType} record →</a>
                      )}
                    </DetailSection>
                    <DetailSection title="Source & lineage">
                      <p style={st.detailText}>
                        {SYSTEM_SOURCES.has(s.source)
                          ? `Emitted automatically by the ${label(s.source)} reactor`
                          : `Captured from ${label(s.source)}`}
                        {' '}on {new Date(s.detectedAt).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE })} · owner {ownerLabel(s.ownerId)}
                      </p>
                      {s.reviewedAt && <p style={{ ...st.detailText, color: 'var(--muted)' }}>Last reviewed {new Date(s.reviewedAt).toLocaleString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE })}{s.reviewedBy ? ` by ${s.reviewedBy}` : ''}</p>}
                    </DetailSection>
                    <DetailSection title="Scoring">
                      <div style={st.scoreLine}>
                        <span style={st.scoreTrack}><span style={{ ...st.scoreFill, width: `${s.confidence}%`, background: band(s.confidence).color }} /></span>
                        <b style={{ color: band(s.confidence).color, fontSize: 12.5 }}>{s.confidence} · {band(s.confidence).name}</b>
                      </div>
                      <p style={{ ...st.detailText, color: 'var(--muted)' }}>Heuristic advisory score based on available signal evidence; it is not an AI probability, opportunity probability, or forecast confidence.</p>
                    </DetailSection>
                    <DetailSection title="Evidence analysis">
                      {ai.reasons.map((r, i) => <p key={i} style={{ ...st.detailText, margin: '0 0 4px' }}>· {r}</p>)}
                    </DetailSection>
                  </div>
                )}
              </div>
            );
          })}</div>}
          <div style={st.pagination}><button style={st.ghostBtn} disabled={offset === 0} onClick={() => updateQuery({ offset: String(Math.max(0, offset - limit)) })}>← Previous</button><span style={st.filterCount}>{offset + 1}–{Math.min(offset + signals.length, total)} of {total}</span><button style={st.ghostBtn} disabled={!hasMore} onClick={() => updateQuery({ offset: String(offset + limit) })}>Next →</button></div>
        </>
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
  success: { border: '1px solid var(--good)', color: 'var(--good)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 12 },
  dismissBox: { border: '1px solid var(--accent)', borderRadius: 10, padding: 12, marginBottom: 14, background: 'var(--panel)' },
  dismissFields: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--muted)', fontSize: 11.5, minWidth: 190 },
  reviewBox: { border: '1px solid var(--accent)', borderRadius: 10, padding: 12, marginTop: 10, background: 'var(--panel-2)' },
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', border: '1px dashed var(--border)', borderRadius: 12, padding: 12, marginBottom: 16, background: 'var(--panel)' },
  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 12, padding: 10, marginBottom: 16, background: 'var(--panel)' },
  filterCount: { color: 'var(--muted)', fontSize: 11.5, marginLeft: 'auto', whiteSpace: 'nowrap' },
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)', fontSize: 12.5 },
  slider: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' },
  primaryBtn: { fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#0b1020', cursor: 'pointer' },
  ghostBtn: { fontSize: 12.5, padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' },
  linkBtn: { fontSize: 12, padding: '4px 6px', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' },
  empty: { color: 'var(--muted)', fontSize: 13.5, border: '1px dashed var(--border)', borderRadius: 12, padding: '22px 18px', textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, alignItems: 'start' },
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 860 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', fontSize: 12, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14 },
  card: { borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 14, background: 'var(--panel)', padding: 14, cursor: 'pointer' },
  cardOpen: { borderColor: 'var(--accent)', gridColumn: '1 / -1' },
  cardTop: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  cardTitle: { fontSize: 14.5, fontWeight: 700, lineHeight: 1.35 },
  chips: { display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 },
  accountChip: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--accent)', color: 'var(--accent)', textDecoration: 'none' },
  chip: { fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', textTransform: 'capitalize' },
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
