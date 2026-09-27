'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { businessDateInputValue } from '@/lib/locale';

interface FollowUp {
  id: string; type: string; subject: string; status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  dueDate: string | null; assigneeId: string | null; outcome: string | null; completedAt: string | null; createdAt: string;
}

const TYPES: Array<[string, string]> = [
  ['follow_up', 'Follow-up'], ['call', 'Call'], ['meeting', 'Meeting'], ['site_visit', 'Site visit'],
  ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['task', 'Task'],
];
const label = (type: string) => TYPES.find(([value]) => value === type)?.[1] ?? type.replace('_', ' ');
const today = () => businessDateInputValue();
const live = (f: FollowUp) => f.status === 'open' || f.status === 'in_progress';

/**
 * Follow-ups scheduled FROM the enquiry (INT-03 / INT-06). The Lead used to offer only one-click
 * outcomes that wrote UNDATED tasks, so nothing on a lead could fall due, become overdue or
 * escalate, and the next action lived nowhere Sales could see it. A follow-up here is an ordinary
 * CRM activity on the lead: it reaches its assignee's My Work once, turns high priority when it
 * falls due, and is completed here with its outcome and, if there is one, the next follow-up.
 */
export default function LeadFollowUps({ leadId, leadName, ownerId }: { leadId: string; leadName: string; ownerId: string | null }) {
  const [rows, setRows] = useState<FollowUp[] | null>(null);
  const [form, setForm] = useState({ type: 'follow_up', subject: '', dueDate: today() });
  const [closing, setClosing] = useState<{ id: string; outcome: string; nextSubject: string; nextDate: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/activities?relatedType=lead&relatedId=${encodeURIComponent(leadId)}`, { cache: 'no-store' }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => []) : [];
    setRows(Array.isArray(body) ? body as FollowUp[] : []);
  }, [leadId]);
  useEffect(() => { void load(); }, [load]);

  const post = async (url: string, body: unknown, done: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json().catch(() => ({})) as { message?: string | string[]; error?: string };
      if (!res.ok) { setError(Array.isArray(result.message) ? result.message.join('; ') : result.message ?? result.error ?? `Refused (${res.status})`); return false; }
      setNotice(done);
      await load();
      return true;
    } catch { setError('The CRM service is unreachable.'); return false; } finally { setBusy(false); }
  };

  const schedule = async () => {
    const ok = await post('/api/crm/activities', {
      type: form.type, subject: form.subject.trim(), dueDate: form.dueDate, relatedType: 'lead', relatedId: leadId, relatedName: leadName,
      ...(ownerId ? { assigneeId: ownerId } : {}),
    }, `Scheduled for ${form.dueDate}${ownerId ? ` — it is on ${ownerId}'s My Work` : ''}.`);
    if (ok) setForm({ type: 'follow_up', subject: '', dueDate: today() });
  };

  const complete = async () => {
    if (!closing) return;
    const ok = await post(`/api/crm/activities/${encodeURIComponent(closing.id)}/complete`, {
      outcome: closing.outcome.trim(),
      ...(closing.nextSubject.trim() ? { followUp: { type: 'follow_up', subject: closing.nextSubject.trim(), dueDate: closing.nextDate || undefined } } : {}),
    }, closing.nextSubject.trim() ? `Completed, and the next follow-up is scheduled for ${closing.nextDate || 'no date'}.` : 'Completed.');
    if (ok) setClosing(null);
  };

  const open = (rows ?? []).filter(live).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const done = (rows ?? []).filter((f) => !live(f));
  const now = today();
  return (
    <section style={st.card} aria-labelledby="lead-follow-ups-heading" data-testid="lead-follow-ups">
      <h3 id="lead-follow-ups-heading" style={st.h3}>Follow-ups</h3>
      <p style={st.rule} data-testid="follow-up-rules">A follow-up goes to {ownerId ? <b>{ownerId}</b> : 'the lead owner'} in My Work. Once past its due date it shows here as overdue and as high priority there, and the CRM escalation sweep notifies its assignee; the same sweep escalates a lead with no first response inside its SLA to its owner.</p>
      {!ownerId && <p style={st.warn}>This lead has no owner yet — assign it first, or the follow-up is yours.</p>}
      <div style={st.form}>
        <label style={st.field}><span>Type</span><select aria-label="Follow-up type" style={st.input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label style={{ ...st.field, flex: 2 }}><span>What</span><input aria-label="Follow-up subject" style={st.input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Call to confirm the site visit date" /></label>
        <label style={st.field}><span>Due</span><input aria-label="Follow-up due date" type="date" style={st.input} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
        <button type="button" style={st.primary} disabled={busy || !form.subject.trim() || !form.dueDate} onClick={() => void schedule()}>Schedule follow-up</button>
      </div>
      {error && <p role="alert" style={st.error}>{error}</p>}
      {notice && <p role="status" style={st.notice}>{notice}</p>}
      {rows === null ? <p style={st.muted}>Loading follow-ups…</p> : open.length === 0 && done.length === 0 ? <p style={st.muted}>No follow-up is scheduled on this enquiry.</p> : null}
      {open.map((f) => {
        const overdue = Boolean(f.dueDate && f.dueDate < now);
        return (
          <div key={f.id} style={{ ...st.row, ...(overdue ? st.overdue : {}) }} data-testid="lead-follow-up" data-follow-up-id={f.id}>
            <span style={st.type}>{label(f.type)}</span>
            <span style={{ flex: 1 }}>{f.subject}</span>
            <span style={st.meta}>{f.assigneeId ?? 'unassigned'} · {overdue ? <b style={st.overdueText}>Overdue · due {f.dueDate}</b> : f.dueDate ? `due ${f.dueDate}` : 'no date'}</span>
            {closing?.id === f.id ? null : <button type="button" style={st.secondary} disabled={busy} onClick={() => setClosing({ id: f.id, outcome: '', nextSubject: '', nextDate: '' })}>Complete</button>}
            {closing?.id === f.id && (
              <div style={st.closing}>
                <input aria-label="Follow-up outcome" style={st.input} value={closing.outcome} onChange={(e) => setClosing({ ...closing, outcome: e.target.value })} placeholder="What happened" />
                <input aria-label="Next follow-up subject" style={st.input} value={closing.nextSubject} onChange={(e) => setClosing({ ...closing, nextSubject: e.target.value })} placeholder="Next follow-up (optional)" />
                <input aria-label="Next follow-up due date" type="date" style={st.input} value={closing.nextDate} onChange={(e) => setClosing({ ...closing, nextDate: e.target.value })} />
                <button type="button" style={st.primary} disabled={busy || !closing.outcome.trim()} onClick={() => void complete()}>Record outcome</button>
                <button type="button" style={st.secondary} disabled={busy} onClick={() => setClosing(null)}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}
      {done.length > 0 && <details style={st.history}><summary>Completed ({done.length})</summary>
        {done.map((f) => <div key={f.id} style={st.historyRow} data-testid="lead-follow-up-done">{label(f.type)} · {f.subject} — {f.status}{f.outcome ? `: ${f.outcome}` : ''}{f.completedAt ? ` · ${f.completedAt.slice(0, 10)}` : ''}</div>)}
      </details>}
    </section>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: 16, margin: '12px 0' } as CSSProperties,
  h3: { margin: '0 0 4px', fontSize: 15 } as CSSProperties,
  rule: { margin: '0 0 10px', color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  warn: { margin: '0 0 8px', color: 'var(--warn)', fontSize: 12 } as CSSProperties,
  form: { display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 } as CSSProperties,
  field: { display: 'grid', gap: 3, fontSize: 11.5, flex: 1, minWidth: 140 } as CSSProperties,
  input: { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 } as CSSProperties,
  primary: { padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#111', fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  secondary: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderTop: '1px solid var(--border)', fontSize: 13 } as CSSProperties,
  overdue: { background: 'color-mix(in srgb, var(--bad) 8%, transparent)' } as CSSProperties,
  overdueText: { color: 'var(--bad)' } as CSSProperties,
  type: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent)' } as CSSProperties,
  meta: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  closing: { display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%' } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 12.5 } as CSSProperties,
  notice: { color: 'var(--good)', fontSize: 12.5 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  history: { marginTop: 8, fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  historyRow: { padding: '3px 0' } as CSSProperties,
};
