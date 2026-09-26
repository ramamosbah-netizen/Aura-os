'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

interface Entry { version: number; act: string; actorId: string; at: string; note: string | null }
export interface PreSalesAssignmentView {
  id: string; opportunityId: string; version: number; assigneeId: string; reviewerId: string; inputRevision: string;
  dueDate: string; deliverables: string[]; status: 'assigned' | 'accepted' | 'declined' | 'completed';
  declineReason: string | null; assignedBy: string; studyId: string | null; acknowledgedAt: string | null; history: Entry[];
}
interface Candidate { userId: string; displayName?: string }

const STATUS: Record<PreSalesAssignmentView['status'], string> = {
  assigned: 'Awaiting the engineer', accepted: 'Accepted — study in progress', declined: 'Declined — back with Sales', completed: 'Completed — study approved',
};
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The Pre-Sales study assignment on a direct opportunity (STU-01, the owner's decision of
 * 2026-09-26): the package Sales handed over, where it stands, and — for Sales — assigning or
 * reissuing it. The engineer answers it in My Work; the approved study completes it.
 */
export default function PreSalesAssignmentPanel({ opportunityId, currentUserId }: { opportunityId: string; currentUserId: string | null }) {
  const [assignment, setAssignment] = useState<PreSalesAssignmentView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [candidates, setCandidates] = useState<{ engineers: Candidate[]; reviewers: Candidate[] } | null>(null);
  const [form, setForm] = useState({ assigneeId: '', reviewerId: '', inputRevision: '', dueDate: today(), deliverables: 'Technical study', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const base = `/api/crm/opportunities/${encodeURIComponent(opportunityId)}/presales-assignment`;

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: 'no-store' }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) as { assignment: PreSalesAssignmentView | null } | null : null;
    setAssignment(body?.assignment ?? null);
    setLoaded(true);
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const open = async () => {
    setError(null); setNotice(null); setEditing(true);
    setForm({
      assigneeId: assignment?.assigneeId ?? '', reviewerId: assignment?.reviewerId ?? '', inputRevision: assignment?.inputRevision ?? '',
      dueDate: assignment?.dueDate ?? today(), deliverables: (assignment?.deliverables ?? ['Technical study']).join('\n'), reason: '',
    });
    const res = await fetch('/api/crm/presales-candidates', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) { setCandidates({ engineers: [], reviewers: [] }); setError(res?.status === 403 ? 'Assigning Pre-Sales work belongs to Sales, under the deal-team grant.' : 'The candidate list is unavailable.'); return; }
    setCandidates(await res.json() as { engineers: Candidate[]; reviewers: Candidate[] });
  };

  const submit = async () => {
    setBusy(true); setError(null);
    const deliverables = form.deliverables.split('\n').map((item) => item.trim()).filter(Boolean);
    const body = assignment
      ? { reason: form.reason, assigneeId: form.assigneeId, reviewerId: form.reviewerId, inputRevision: form.inputRevision, dueDate: form.dueDate, deliverables }
      : { assigneeId: form.assigneeId, reviewerId: form.reviewerId, inputRevision: form.inputRevision, dueDate: form.dueDate, deliverables };
    try {
      const res = await fetch(assignment ? `${base}/reissue` : base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json().catch(() => ({})) as { message?: string | string[] };
      if (!res.ok) { setError(Array.isArray(result.message) ? result.message.join('; ') : result.message ?? `Refused (${res.status})`); return; }
      setEditing(false);
      setNotice(assignment ? 'Reissued. The engineer answers the new version in My Work.' : 'Assigned. The engineer answers it in My Work.');
      await load();
    } catch { setError('The CRM service is unreachable.'); } finally { setBusy(false); }
  };

  if (!loaded) return null;
  const mine = assignment && currentUserId === assignment.assigneeId;
  const name = (c: Candidate) => (c.displayName && c.displayName !== c.userId ? `${c.displayName} · ${c.userId}` : c.userId);
  return (
    <section style={st.panel} aria-labelledby="presales-assignment-heading" data-testid="presales-assignment">
      <div style={st.head}>
        <div>
          <p style={st.eyebrow}>SALES → PRE-SALES</p>
          <h2 id="presales-assignment-heading" style={st.h2}>Pre-Sales assignment{assignment ? ` · v${assignment.version}` : ''}</h2>
        </div>
        {assignment && <span style={st.status} data-testid="presales-assignment-status">{STATUS[assignment.status]}</span>}
      </div>
      {!assignment ? <p style={st.muted}>No Pre-Sales study has been assigned on this opportunity. Until one is, the study is unassigned and any Pre-Sales engineer may write it.</p> : <>
        <dl style={st.grid}>
          <div><dt>Engineer</dt><dd>{assignment.assigneeId}</dd></div>
          <div><dt>Reviewer</dt><dd>{assignment.reviewerId}</dd></div>
          <div><dt>Input revision</dt><dd>{assignment.inputRevision}</dd></div>
          <div><dt>Due</dt><dd>{assignment.dueDate}</dd></div>
          <div style={{ gridColumn: '1 / -1' }}><dt>Deliverables</dt><dd>{assignment.deliverables.join(' · ')}</dd></div>
        </dl>
        {assignment.status === 'declined' && <p style={st.alert} role="status">Declined by {assignment.assigneeId}: {assignment.declineReason}. Reissue it to another engineer, or to the same one with a changed package.</p>}
        {mine && assignment.status === 'assigned' && <p style={st.callout}>This study is assigned to you. Accept or decline it in <a href={`/my-work/tasks?task=${assignment.id}`}>My Work</a> — the study starts once you accept.</p>}
        {assignment.status === 'accepted' && <p style={st.muted}>The study is {assignment.assigneeId}&apos;s to write, for {assignment.reviewerId} to review, on {assignment.inputRevision}. It completes itself when the study is approved.</p>}
        {assignment.status === 'completed' && <p style={st.muted}>The approved study completed this assignment{assignment.acknowledgedAt ? ', and Sales has received it.' : '; Sales receives it in My Work.'}</p>}
        <details style={st.history}><summary>History ({assignment.history.length})</summary>
          {assignment.history.map((h, i) => <div key={i} style={st.historyRow}>v{h.version} · {h.act} · {h.actorId} · {h.at.slice(0, 16).replace('T', ' ')}{h.note ? ` — ${h.note}` : ''}</div>)}
        </details>
      </>}
      {notice && <p role="status" style={st.notice}>{notice}</p>}
      {!editing && !mine && currentUserId !== assignment?.reviewerId && (
        <button type="button" style={st.secondary} onClick={() => void open()}>{assignment ? 'Reissue the package' : 'Assign Pre-Sales study'}</button>
      )}
      {editing && (
        <div style={st.form} data-testid="presales-assignment-form">
          <label style={st.field}><span>Pre-Sales engineer</span>
            <select style={st.input} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Select engineer</option>
              {(candidates?.engineers ?? []).map((c) => <option key={c.userId} value={c.userId}>{name(c)}</option>)}
            </select></label>
          <label style={st.field}><span>Technical reviewer</span>
            <select style={st.input} value={form.reviewerId} onChange={(e) => setForm({ ...form, reviewerId: e.target.value })}>
              <option value="">Select reviewer</option>
              {(candidates?.reviewers ?? []).filter((c) => c.userId !== form.assigneeId).map((c) => <option key={c.userId} value={c.userId}>{name(c)}</option>)}
            </select></label>
          <label style={st.field}><span>Input revision</span><input style={st.input} value={form.inputRevision} onChange={(e) => setForm({ ...form, inputRevision: e.target.value })} /></label>
          <label style={st.field}><span>Study due date</span><input style={st.input} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
          <label style={{ ...st.field, gridColumn: '1 / -1' }}><span>Deliverables — one per line</span><textarea style={st.input} rows={3} value={form.deliverables} onChange={(e) => setForm({ ...form, deliverables: e.target.value })} /></label>
          {assignment && <label style={{ ...st.field, gridColumn: '1 / -1' }}><span>Reason for reissuing</span><input style={st.input} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Engineer on leave, new client issue, reviewer change…" /></label>}
          {error && <p role="alert" style={st.alert}>{error}</p>}
          <div style={st.actions}>
            <button type="button" style={st.primary} disabled={busy || !form.assigneeId || !form.reviewerId || !form.inputRevision.trim() || (Boolean(assignment) && form.reason.trim().length < 3)} onClick={() => void submit()}>{busy ? 'Saving…' : assignment ? 'Reissue' : 'Assign'}</button>
            <button type="button" style={st.secondary} disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!editing && error && <p role="alert" style={st.alert}>{error}</p>}
    </section>
  );
}

const st = {
  panel: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: 18, marginBottom: 14 } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' } as CSSProperties,
  eyebrow: { margin: 0, color: 'var(--accent)', fontSize: 11, fontWeight: 800, letterSpacing: 1 } as CSSProperties,
  h2: { margin: '3px 0 8px', fontSize: 18 } as CSSProperties,
  status: { border: '1px solid var(--border)', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '6px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, margin: '6px 0' } as CSSProperties,
  callout: { background: 'var(--accent-soft, rgba(245,158,11,0.12))', borderRadius: 8, padding: '8px 10px', fontSize: 13 } as CSSProperties,
  alert: { color: 'var(--danger, #dc2626)', fontSize: 13, margin: '6px 0' } as CSSProperties,
  notice: { color: 'var(--success, #16a34a)', fontSize: 13, margin: '6px 0' } as CSSProperties,
  history: { fontSize: 12, color: 'var(--muted)', margin: '6px 0' } as CSSProperties,
  historyRow: { padding: '3px 0' } as CSSProperties,
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 } as CSSProperties,
  field: { display: 'grid', gap: 4, fontSize: 12 } as CSSProperties,
  input: { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 } as CSSProperties,
  actions: { display: 'flex', gap: 8, gridColumn: '1 / -1' } as CSSProperties,
  primary: { padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#111', fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  secondary: { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' } as CSSProperties,
};
